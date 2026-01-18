export type ApiError = {
  code: string;
  message: string;
};

export class BackendError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;

  constructor(input: { code: string; message: string; status: number; requestId?: string }) {
    super(input.message);
    this.code = input.code;
    this.status = input.status;
    this.requestId = input.requestId;
  }
}

async function readJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function toErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (p.error && typeof p.error === "object") {
      const e = p.error as Record<string, unknown>;
      const msg = typeof e.message === "string" ? e.message : "";
      if (msg) return msg;
    }
    if (typeof p.message === "string" && p.message.trim()) return p.message.trim();
    if (typeof p.error === "string" && p.error.trim()) return p.error.trim();
    if (p.raw && typeof p.raw === "string" && p.raw.trim()) return p.raw.trim();
  }
  return fallback;
}

function toErrorCode(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (p.error && typeof p.error === "object") {
      const e = p.error as Record<string, unknown>;
      const code = typeof e.code === "string" ? e.code : "";
      if (code) return code;
    }
  }
  return `HTTP_${status}`;
}

function toRequestId(payload: unknown): string | undefined {
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (typeof p.requestId === "string" && p.requestId.trim()) return p.requestId.trim();
  }
  return undefined;
}

export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  return await apiJsonWithRetry<T>(url, init, { triedRefresh: false });
}

async function apiJsonWithRetry<T>(url: string, init: RequestInit | undefined, state: { triedRefresh: boolean }): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  const payload = await readJsonSafe(res);

  if (res.status === 401 && !state.triedRefresh && shouldAttemptRefresh(url)) {
    const refreshOk = await tryRefresh();
    if (refreshOk) return await apiJsonWithRetry<T>(url, init, { triedRefresh: true });
  }

  if (!res.ok) {
    throw new BackendError({
      code: toErrorCode(payload, res.status),
      message: toErrorMessage(payload, res.statusText),
      status: res.status,
      requestId: toRequestId(payload)
    });
  }

  return payload as T;
}

function shouldAttemptRefresh(url: string) {
  if (url.startsWith("/api/auth/")) return false;
  if (url === "/api/auth/refresh") return false;
  return true;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
    return res.ok;
  } catch {
    return false;
  }
}
