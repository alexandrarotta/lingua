import crypto from "node:crypto";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import Fastify, { type FastifyBaseLogger } from "fastify";
import { ACCESS_COOKIE } from "../auth/cookies.js";
import { LinguaDb } from "../db/db.js";
import { ApiError } from "../lib/apiError.js";
import { registerAiRoutes } from "../routes/ai.js";
import { registerAuthRoutes } from "../routes/auth.js";
import { registerCoachRoutes } from "../routes/coach.js";
import { registerHealthRoutes } from "../routes/health.js";
import { registerLessonsRoutes } from "../routes/lessons.js";
import { registerSessionsRoutes } from "../routes/sessions.js";

export async function buildApp(options?: { logger?: boolean | FastifyBaseLogger; dbPath?: string }) {
  const app = Fastify({
    genReqId: (req) => {
      const v = req.headers["x-request-id"];
      if (typeof v === "string" && v.trim()) return v.trim();
      return crypto.randomUUID();
    },
    logger:
      options?.logger ??
      ({
        level: process.env.LOG_LEVEL ?? "info",
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers[\"x-api-key\"]",
            "req.headers.cookie",
            "res.headers[\"set-cookie\"]",
            "req.body.ai.apiKey",
            "req.body.password",
            "req.body.newPassword",
            "req.body.token"
          ],
          censor: "[REDACTED]"
        }
      } as const)
  });

  app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? true,
    credentials: true
  });

  app.addHook("onRequest", async (req, reply) => {
    reply.header("x-request-id", req.id);
  });

  const db = await LinguaDb.open({ dbPath: options?.dbPath, logger: { info: (msg) => app.log.info(msg) } });
  app.decorate("db", db);
  app.addHook("onClose", async () => {
    db.close();
  });

  const jwtSecret = process.env.AUTH_JWT_SECRET?.trim() || crypto.randomBytes(32).toString("hex");
  if (!process.env.AUTH_JWT_SECRET) {
    app.log.warn("[auth] AUTH_JWT_SECRET not set; tokens will reset on server restart");
  }

  await app.register(cookie);
  await app.register(jwt, {
    secret: jwtSecret,
    cookie: {
      cookieName: ACCESS_COOKIE,
      signed: false
    }
  });

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof ApiError) {
      const statusCode = err.statusCode;
      if (statusCode >= 500) app.log.error({ err, statusCode, requestId: req.id }, "API error");
      else req.log.info({ err: { code: err.code, message: err.message }, statusCode }, "API error");
      void reply.status(statusCode).send({ ok: false, error: { code: err.code, message: err.message }, requestId: req.id });
      return;
    }

    const e = err as { message?: string; statusCode?: number };
    const statusCode = e.statusCode && e.statusCode >= 400 ? e.statusCode : 500;
    app.log.error({ err, statusCode, requestId: req.id }, "Unhandled error");
    void reply.status(statusCode).send({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: statusCode === 500 ? "Internal error" : e.message || "Error" },
      requestId: req.id
    });
  });

  registerHealthRoutes(app);
  registerAuthRoutes(app);
  registerSessionsRoutes(app);
  registerAiRoutes(app);
  registerCoachRoutes(app);
  registerLessonsRoutes(app);

  return app;
}
