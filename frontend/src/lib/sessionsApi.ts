import { apiJson } from "./backend";

export type HistorySession = {
  id: string;
  userId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type HistoryTurn = {
  id: string;
  sessionId: string;
  userId: string;
  role: "user" | "assistant";
  text: string;
  metaJson: string | null;
  createdAt: number;
};

export async function listSessions(input?: { limit?: number; before?: number | null }) {
  const qs = new URLSearchParams();
  if (input?.limit) qs.set("limit", String(input.limit));
  if (input?.before) qs.set("before", String(input.before));
  const res = await apiJson<{ ok: true; sessions: HistorySession[]; nextCursor: number | null }>(
    `/api/sessions${qs.toString() ? `?${qs.toString()}` : ""}`
  );
  return res;
}

export async function createSession(input: { title?: string }) {
  const res = await apiJson<{ ok: true; session: HistorySession }>("/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return res.session;
}

export async function getSession(id: string) {
  const res = await apiJson<{ ok: true; session: HistorySession }>(`/api/sessions/${encodeURIComponent(id)}`);
  return res.session;
}

export async function deleteSession(id: string) {
  await apiJson<{ ok: true }>(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function listTurns(input: { sessionId: string; limit?: number; before?: number | null }) {
  const qs = new URLSearchParams();
  if (input.limit) qs.set("limit", String(input.limit));
  if (input.before) qs.set("before", String(input.before));
  const res = await apiJson<{ ok: true; turns: HistoryTurn[]; nextCursor: number | null }>(
    `/api/sessions/${encodeURIComponent(input.sessionId)}/turns${qs.toString() ? `?${qs.toString()}` : ""}`
  );
  return res;
}

export async function addTurn(input: { sessionId: string; role: "user" | "assistant"; text: string; meta?: unknown }) {
  const res = await apiJson<{ ok: true; turn: HistoryTurn }>(`/api/sessions/${encodeURIComponent(input.sessionId)}/turns`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: input.role, text: input.text, meta: input.meta })
  });
  return res.turn;
}

