import type { FastifyRequest } from "fastify";

export const ACCESS_COOKIE = "lingua_access";
export const REFRESH_COOKIE = "lingua_refresh";

function headerValue(headers: Record<string, unknown>, key: string): string {
  const v = headers[key.toLowerCase()];
  return typeof v === "string" ? v : "";
}

export function shouldUseSecureCookies(req: FastifyRequest): boolean {
  const headers = req.headers as Record<string, unknown>;
  const xfProto = headerValue(headers, "x-forwarded-proto").toLowerCase();
  if (xfProto === "https") return true;

  const origin = headerValue(headers, "origin").toLowerCase();
  if (origin.startsWith("https://")) return true;

  const referer = headerValue(headers, "referer").toLowerCase();
  if (referer.startsWith("https://")) return true;

  return false;
}

export function cookieBaseOptions(req: FastifyRequest) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: shouldUseSecureCookies(req),
    path: "/"
  };
}

