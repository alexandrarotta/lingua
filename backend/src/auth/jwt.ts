import type { FastifyInstance } from "fastify";
import type { UserRow } from "../db/db.js";

export type AuthTokenType = "access" | "refresh";

export type AuthJwtPayload = {
  sub: string;
  email: string;
  tokenVersion: number;
  type: AuthTokenType;
};

const ACCESS_EXPIRES_IN = "15m";
const REFRESH_EXPIRES_IN = "7d";

export function signAccessToken(app: FastifyInstance, user: Pick<UserRow, "id" | "email" | "tokenVersion">) {
  const payload: AuthJwtPayload = { sub: user.id, email: user.email, tokenVersion: user.tokenVersion, type: "access" };
  return app.jwt.sign(payload, { expiresIn: ACCESS_EXPIRES_IN });
}

export function signRefreshToken(app: FastifyInstance, user: Pick<UserRow, "id" | "email" | "tokenVersion">) {
  const payload: AuthJwtPayload = { sub: user.id, email: user.email, tokenVersion: user.tokenVersion, type: "refresh" };
  return app.jwt.sign(payload, { expiresIn: REFRESH_EXPIRES_IN });
}

export function refreshCookieMaxAgeSeconds() {
  // 7 days
  return 7 * 24 * 60 * 60;
}

export function accessCookieMaxAgeSeconds() {
  // 15 minutes
  return 15 * 60;
}

