import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server/app.js";

type CookieMap = Record<string, string>;

function parseSetCookie(setCookie: string): { name: string; value: string } | null {
  const first = setCookie.split(";")[0] ?? "";
  const idx = first.indexOf("=");
  if (idx <= 0) return null;
  const name = first.slice(0, idx).trim();
  const value = first.slice(idx + 1).trim();
  if (!name) return null;
  return { name, value };
}

function mergeCookies(map: CookieMap, setCookieHeader: string | string[] | undefined) {
  const items = Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [setCookieHeader] : [];
  for (const item of items) {
    const parsed = parseSetCookie(item);
    if (!parsed) continue;
    map[parsed.name] = parsed.value;
  }
}

function cookieHeader(map: CookieMap) {
  return Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

describe("auth + sessions (integration)", () => {
  it("register/login/me + sessions isolation", async () => {
    const app = await buildApp({ logger: false, dbPath: ":memory:" });

    const jarA: CookieMap = {};
    const jarB: CookieMap = {};

    const regA = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "a@example.com", password: "password123" }
    });
    expect(regA.statusCode).toBe(200);
    mergeCookies(jarA, regA.headers["set-cookie"]);

    const regB = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "b@example.com", password: "password123" }
    });
    expect(regB.statusCode).toBe(200);
    mergeCookies(jarB, regB.headers["set-cookie"]);

    const meA = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: cookieHeader(jarA) } });
    expect(meA.statusCode).toBe(200);
    expect(meA.json()).toMatchObject({ ok: true, user: { email: "a@example.com" } });

    const created = await app.inject({
      method: "POST",
      url: "/api/sessions",
      headers: { cookie: cookieHeader(jarA) },
      payload: { title: "A session" }
    });
    expect(created.statusCode).toBe(200);
    const sessionId = created.json().session.id as string;
    expect(typeof sessionId).toBe("string");

    const addTurnRes = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/turns`,
      headers: { cookie: cookieHeader(jarA) },
      payload: { role: "user", text: "hello", meta: { kind: "chat" } }
    });
    expect(addTurnRes.statusCode).toBe(200);

    const listA = await app.inject({ method: "GET", url: "/api/sessions", headers: { cookie: cookieHeader(jarA) } });
    expect(listA.statusCode).toBe(200);
    expect(listA.json().sessions.length).toBe(1);

    const forbiddenGet = await app.inject({
      method: "GET",
      url: `/api/sessions/${sessionId}`,
      headers: { cookie: cookieHeader(jarB) }
    });
    expect(forbiddenGet.statusCode).toBe(404);

    const forbiddenDelete = await app.inject({
      method: "DELETE",
      url: `/api/sessions/${sessionId}`,
      headers: { cookie: cookieHeader(jarB) }
    });
    expect(forbiddenDelete.statusCode).toBe(404);
  });

  it("forgot-password + reset-password changes password and token is single-use", async () => {
    const app = await buildApp({ logger: false, dbPath: ":memory:" });

    const jar: CookieMap = {};

    const reg = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "x@example.com", password: "password123" }
    });
    expect(reg.statusCode).toBe(200);
    mergeCookies(jar, reg.headers["set-cookie"]);

    const forgot = await app.inject({
      method: "POST",
      url: "/api/auth/forgot-password",
      payload: { email: "x@example.com" }
    });
    expect(forgot.statusCode).toBe(200);
    const forgotJson = forgot.json() as { resetToken: string | null };
    expect(typeof forgotJson.resetToken).toBe("string");
    const token = forgotJson.resetToken!;

    const reset = await app.inject({
      method: "POST",
      url: "/api/auth/reset-password",
      payload: { token, newPassword: "newpassword123" }
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toMatchObject({ ok: true });

    const reuse = await app.inject({
      method: "POST",
      url: "/api/auth/reset-password",
      payload: { token, newPassword: "anotherpassword123" }
    });
    expect(reuse.statusCode).toBe(400);

    const loginOld = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "x@example.com", password: "password123" }
    });
    expect(loginOld.statusCode).toBe(401);

    const loginNew = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "x@example.com", password: "newpassword123" }
    });
    expect(loginNew.statusCode).toBe(200);
  });
});

