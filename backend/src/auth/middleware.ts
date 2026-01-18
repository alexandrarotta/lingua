import type { FastifyReply, FastifyRequest } from "fastify";
import { unauthorized } from "../lib/apiError.js";
import type { AuthJwtPayload } from "./jwt.js";

export type AuthUser = {
  id: string;
  email: string;
  tokenVersion: number;
};

function asAuthJwtPayload(v: unknown): AuthJwtPayload | null {
  const p = v as Partial<AuthJwtPayload> | null;
  if (!p || typeof p !== "object") return null;
  if (typeof p.sub !== "string") return null;
  if (typeof p.email !== "string") return null;
  if (typeof p.type !== "string") return null;
  if (typeof p.tokenVersion !== "number") return null;
  if (p.type !== "access" && p.type !== "refresh") return null;
  return p as AuthJwtPayload;
}

export async function requireAuth(req: FastifyRequest, _reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    throw unauthorized();
  }

  const payload = asAuthJwtPayload(req.user);
  if (!payload || payload.type !== "access") throw unauthorized();

  const user = req.server.db.getUserById(payload.sub);
  if (!user) throw unauthorized();
  if (user.tokenVersion !== payload.tokenVersion) throw unauthorized();

  req.authUser = { id: user.id, email: user.email, tokenVersion: user.tokenVersion };
}

