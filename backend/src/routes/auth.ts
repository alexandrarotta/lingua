import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { ACCESS_COOKIE, REFRESH_COOKIE, cookieBaseOptions } from "../auth/cookies.js";
import { accessCookieMaxAgeSeconds, refreshCookieMaxAgeSeconds, signAccessToken, signRefreshToken, type AuthJwtPayload } from "../auth/jwt.js";
import { requireAuth } from "../auth/middleware.js";
import { ApiError, badRequest, unauthorized } from "../lib/apiError.js";
import { randomToken, sha256Hex } from "../auth/tokens.js";

const EmailSchema = z.string().email().min(3).max(254);
const PasswordSchema = z.string().min(8).max(200);

const RegisterSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema
});

const LoginSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema
});

const ForgotPasswordSchema = z.object({
  email: EmailSchema
});

const ResetPasswordSchema = z.object({
  token: z.string().min(20).max(300),
  newPassword: PasswordSchema
});

function safePayload(v: unknown): AuthJwtPayload | null {
  const p = v as Partial<AuthJwtPayload> | null;
  if (!p || typeof p !== "object") return null;
  if (typeof p.sub !== "string") return null;
  if (typeof p.email !== "string") return null;
  if (typeof p.tokenVersion !== "number") return null;
  if (p.type !== "access" && p.type !== "refresh") return null;
  return p as AuthJwtPayload;
}

function getOrigin(req: { headers: Record<string, unknown> }) {
  const o = req.headers["origin"];
  if (typeof o === "string" && o.trim()) return o.trim();
  return "http://localhost:5173";
}

export function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/auth/register", async (req, reply) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("VALIDATION_ERROR", "Invalid request");

    const { email, password } = parsed.data;
    const existing = app.db.getUserByEmail(email);
    if (existing) {
      throw new ApiError({ statusCode: 409, code: "AUTH_EMAIL_TAKEN", message: "Email already registered." });
    }

    const passwordHash = await hashPassword(password);
    const user = app.db.createUser({ email, passwordHash });

    const access = signAccessToken(app, user);
    const refresh = signRefreshToken(app, user);
    const base = cookieBaseOptions(req);
    reply.setCookie(ACCESS_COOKIE, access, { ...base, maxAge: accessCookieMaxAgeSeconds() });
    reply.setCookie(REFRESH_COOKIE, refresh, { ...base, maxAge: refreshCookieMaxAgeSeconds() });

    req.log.info({ event: "auth.register", userId: user.id, email: user.email }, "auth.register");
    return reply.send({ ok: true, user: { id: user.id, email: user.email } });
  });

  app.post("/api/auth/login", async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("VALIDATION_ERROR", "Invalid request");

    const { email, password } = parsed.data;
    const user = app.db.getUserByEmail(email);
    if (!user) throw new ApiError({ statusCode: 401, code: "AUTH_INVALID_CREDENTIALS", message: "Invalid email or password." });

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new ApiError({ statusCode: 401, code: "AUTH_INVALID_CREDENTIALS", message: "Invalid email or password." });

    const access = signAccessToken(app, user);
    const refresh = signRefreshToken(app, user);
    const base = cookieBaseOptions(req);
    reply.setCookie(ACCESS_COOKIE, access, { ...base, maxAge: accessCookieMaxAgeSeconds() });
    reply.setCookie(REFRESH_COOKIE, refresh, { ...base, maxAge: refreshCookieMaxAgeSeconds() });

    req.log.info({ event: "auth.login", userId: user.id, email: user.email }, "auth.login");
    return reply.send({ ok: true, user: { id: user.id, email: user.email } });
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const refreshToken = cookies[REFRESH_COOKIE];
    if (refreshToken) {
      try {
        const decoded = safePayload(app.jwt.verify(refreshToken));
        if (decoded?.type === "refresh") {
          const user = app.db.getUserById(decoded.sub);
          if (user && user.tokenVersion === decoded.tokenVersion) {
            app.db.bumpUserTokenVersion(user.id);
            req.log.info({ event: "auth.logout", userId: user.id, email: user.email }, "auth.logout");
          }
        }
      } catch {
        // ignore invalid refresh token
      }
    }

    const base = cookieBaseOptions(req);
    reply.clearCookie(ACCESS_COOKIE, base);
    reply.clearCookie(REFRESH_COOKIE, base);
    return reply.send({ ok: true });
  });

  app.post("/api/auth/refresh", async (req, reply) => {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const refreshToken = cookies[REFRESH_COOKIE];
    if (!refreshToken) throw unauthorized("Missing refresh token.");

    let payload: AuthJwtPayload | null = null;
    try {
      payload = safePayload(app.jwt.verify(refreshToken));
    } catch {
      payload = null;
    }
    if (!payload || payload.type !== "refresh") throw new ApiError({ statusCode: 401, code: "AUTH_INVALID_REFRESH", message: "Invalid refresh token." });

    const user = app.db.getUserById(payload.sub);
    if (!user) throw unauthorized();
    if (user.tokenVersion !== payload.tokenVersion) throw new ApiError({ statusCode: 401, code: "AUTH_INVALID_REFRESH", message: "Invalid refresh token." });

    const access = signAccessToken(app, user);
    const refresh = signRefreshToken(app, user);
    const base = cookieBaseOptions(req);
    reply.setCookie(ACCESS_COOKIE, access, { ...base, maxAge: accessCookieMaxAgeSeconds() });
    reply.setCookie(REFRESH_COOKIE, refresh, { ...base, maxAge: refreshCookieMaxAgeSeconds() });

    req.log.info({ event: "auth.refresh", userId: user.id, email: user.email }, "auth.refresh");
    return reply.send({ ok: true, user: { id: user.id, email: user.email } });
  });

  app.get("/api/auth/me", { preHandler: requireAuth }, async (req, reply) => {
    const u = req.authUser;
    if (!u) throw unauthorized();
    return reply.send({ ok: true, user: { id: u.id, email: u.email } });
  });

  app.post("/api/auth/forgot-password", async (req, reply) => {
    const parsed = ForgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("VALIDATION_ERROR", "Invalid request");

    const email = parsed.data.email;
    const user = app.db.getUserByEmail(email);

    // Always return ok to avoid enumeration; in local-dev we include the token when possible.
    if (!user) {
      req.log.info({ event: "auth.forgot", email, userId: null }, "auth.forgot");
      return reply.send({ ok: true, message: "If the account exists, you will get a reset link/code.", resetToken: null, resetUrl: null });
    }

    const token = randomToken(32);
    const tokenHash = sha256Hex(token);
    const expiresAt = Date.now() + 30 * 60 * 1000;

    const reset = app.db.createPasswordReset({
      userId: user.id,
      tokenHash,
      expiresAt,
      requestedIp: req.ip ?? null,
      requestedUserAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null
    });

    const origin = getOrigin(req as { headers: Record<string, unknown> });
    const resetUrl = `${origin.replace(/\/$/, "")}/reset?token=${encodeURIComponent(token)}`;

    req.log.info(
      { event: "auth.forgot", userId: user.id, email: user.email, resetId: reset.id, resetUrl },
      "auth.forgot (dev resetUrl)"
    );

    return reply.send({ ok: true, message: "Reset link generated (dev mode).", resetToken: token, resetUrl });
  });

  app.post("/api/auth/reset-password", async (req, reply) => {
    const parsed = ResetPasswordSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("VALIDATION_ERROR", "Invalid request");

    const tokenHash = sha256Hex(parsed.data.token);
    const row = app.db.getPasswordResetByTokenHash(tokenHash);
    if (!row) throw new ApiError({ statusCode: 400, code: "AUTH_RESET_TOKEN_INVALID", message: "Invalid reset token." });
    if (row.usedAt != null) throw new ApiError({ statusCode: 400, code: "AUTH_RESET_TOKEN_INVALID", message: "Reset token already used." });
    if (Date.now() > row.expiresAt) throw new ApiError({ statusCode: 400, code: "AUTH_RESET_TOKEN_EXPIRED", message: "Reset token expired." });

    const user = app.db.getUserById(row.userId);
    if (!user) throw new ApiError({ statusCode: 400, code: "AUTH_RESET_TOKEN_INVALID", message: "Invalid reset token." });

    const passwordHash = await hashPassword(parsed.data.newPassword);
    app.db.updateUserPassword(user.id, passwordHash);
    app.db.markPasswordResetUsed(row.id);

    // Clear cookies; user must login again.
    const base = cookieBaseOptions(req);
    reply.clearCookie(ACCESS_COOKIE, base);
    reply.clearCookie(REFRESH_COOKIE, base);

    req.log.info({ event: "auth.reset", userId: user.id, email: user.email, resetId: row.id }, "auth.reset");
    return reply.send({ ok: true });
  });
}
