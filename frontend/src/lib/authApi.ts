import { apiJson } from "./backend";

export type AuthUser = { id: string; email: string };

export async function authRegister(input: { email: string; password: string }): Promise<{ user: AuthUser }> {
  const res = await apiJson<{ ok: true; user: AuthUser }>("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return { user: res.user };
}

export async function authLogin(input: { email: string; password: string }): Promise<{ user: AuthUser }> {
  const res = await apiJson<{ ok: true; user: AuthUser }>("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return { user: res.user };
}

export async function authLogout(): Promise<void> {
  await apiJson<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

export async function authRefresh(): Promise<{ user: AuthUser }> {
  const res = await apiJson<{ ok: true; user: AuthUser }>("/api/auth/refresh", { method: "POST" });
  return { user: res.user };
}

export async function authMe(): Promise<{ user: AuthUser }> {
  const res = await apiJson<{ ok: true; user: AuthUser }>("/api/auth/me");
  return { user: res.user };
}

export async function authForgotPassword(input: { email: string }): Promise<{ message: string; resetUrl: string | null; resetToken: string | null }> {
  const res = await apiJson<{ ok: true; message: string; resetUrl: string | null; resetToken: string | null }>("/api/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return { message: res.message, resetUrl: res.resetUrl, resetToken: res.resetToken };
}

export async function authResetPassword(input: { token: string; newPassword: string }): Promise<void> {
  await apiJson<{ ok: true }>("/api/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
}

