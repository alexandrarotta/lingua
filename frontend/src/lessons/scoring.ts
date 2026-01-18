import type { PronunciationToken } from "../lib/diffTokens";

export function tokenAccuracy(tokens: PronunciationToken[]) {
  const expected = tokens.filter((t) => t.status !== "extra").length;
  const ok = tokens.filter((t) => t.status === "ok").length;
  const accuracy = expected > 0 ? ok / expected : 0;
  return { ok, expected, accuracy };
}

export function normalizeShortAnswer(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[’‘‛ʼ]/g, "'")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}' ]+/gu, "")
    .replace(/\s+/g, " ");
}
