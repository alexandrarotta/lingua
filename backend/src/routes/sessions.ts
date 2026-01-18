import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { badRequest, notFound } from "../lib/apiError.js";

const CreateSessionSchema = z.object({
  title: z.string().max(120).optional()
});

const CreateTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(50_000),
  meta: z.unknown().optional()
});

function asLimit(v: unknown, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

function asCursor(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export function registerSessionsRoutes(app: FastifyInstance) {
  app.get("/api/sessions", { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.authUser!.id;
    const q = req.query as Record<string, unknown>;
    const limit = asLimit(q.limit, 30);
    const before = asCursor(q.before);
    const { sessions, nextCursor } = app.db.listSessions({ userId, limit, beforeUpdatedAt: before });
    return reply.send({ ok: true, sessions, nextCursor });
  });

  app.post("/api/sessions", { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.authUser!.id;
    const parsed = CreateSessionSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("VALIDATION_ERROR", "Invalid request");
    const title = parsed.data.title?.trim() || "New session";
    const session = app.db.createSession({ userId, title });
    req.log.info({ event: "sessions.create", userId, sessionId: session.id }, "sessions.create");
    return reply.send({ ok: true, session });
  });

  app.get("/api/sessions/:id", { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.authUser!.id;
    const sessionId = String((req.params as { id: string }).id);
    const session = app.db.getSessionById({ userId, sessionId });
    if (!session) throw notFound("SESSION_NOT_FOUND", "Session not found.");
    return reply.send({ ok: true, session });
  });

  app.delete("/api/sessions/:id", { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.authUser!.id;
    const sessionId = String((req.params as { id: string }).id);
    const ok = app.db.deleteSession({ userId, sessionId });
    if (!ok) throw notFound("SESSION_NOT_FOUND", "Session not found.");
    req.log.info({ event: "sessions.delete", userId, sessionId }, "sessions.delete");
    return reply.send({ ok: true });
  });

  app.post("/api/sessions/:id/turns", { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.authUser!.id;
    const sessionId = String((req.params as { id: string }).id);
    const parsed = CreateTurnSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("VALIDATION_ERROR", "Invalid request");
    const session = app.db.getSessionById({ userId, sessionId });
    if (!session) throw notFound("SESSION_NOT_FOUND", "Session not found.");

    const metaJson = parsed.data.meta === undefined ? null : JSON.stringify(parsed.data.meta);
    const turn = app.db.addTurn({
      userId,
      sessionId,
      role: parsed.data.role,
      text: parsed.data.text,
      metaJson
    });
    return reply.send({ ok: true, turn });
  });

  app.get("/api/sessions/:id/turns", { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.authUser!.id;
    const sessionId = String((req.params as { id: string }).id);
    const q = req.query as Record<string, unknown>;
    const limit = asLimit(q.limit, 120);
    const before = asCursor(q.before);
    const session = app.db.getSessionById({ userId, sessionId });
    if (!session) throw notFound("SESSION_NOT_FOUND", "Session not found.");
    const { turns, nextCursor } = app.db.listTurns({ userId, sessionId, limit, beforeCreatedAt: before });
    return reply.send({ ok: true, turns, nextCursor });
  });
}

