export type PronunciationToken =
  | { status: "ok"; expected: string; actual: string }
  | { status: "missing"; expected: string }
  | { status: "extra"; actual: string }
  | { status: "substituted"; expected: string; actual: string };

function normalizeWord(w: string) {
  return w
    .toLowerCase()
    .replace(/[’‘‛ʼ]/g, "'")
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}']+/gu, "")
    .replace(/^'+|'+$/g, "")
    .trim();
}

function tokenize(text: string) {
  return text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((raw) => ({ raw, norm: normalizeWord(raw) }))
    .filter((t) => t.norm.length > 0);
}

type Op = "eq" | "sub" | "ins" | "del";

export function diffTokens(targetText: string, transcriptText: string): PronunciationToken[] {
  const target = tokenize(targetText);
  const transcript = tokenize(transcriptText);

  const n = target.length;
  const m = transcript.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  const back: Op[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill("eq"));

  for (let i = 1; i <= n; i++) {
    dp[i]![0] = i;
    back[i]![0] = "del";
  }
  for (let j = 1; j <= m; j++) {
    dp[0]![j] = j;
    back[0]![j] = "ins";
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const same = target[i - 1]!.norm === transcript[j - 1]!.norm;
      const costSub = dp[i - 1]![j - 1]! + (same ? 0 : 1);
      const costDel = dp[i - 1]![j]! + 1;
      const costIns = dp[i]![j - 1]! + 1;

      const best = Math.min(costSub, costDel, costIns);
      dp[i]![j] = best;
      if (best === costSub) back[i]![j] = same ? "eq" : "sub";
      else if (best === costDel) back[i]![j] = "del";
      else back[i]![j] = "ins";
    }
  }

  const out: PronunciationToken[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const op = back[i]![j] as Op | undefined;
    if (i > 0 && j > 0 && (op === "eq" || op === "sub")) {
      const expected = target[i - 1]!.raw;
      const actual = transcript[j - 1]!.raw;
      out.push(op === "eq" ? { status: "ok", expected, actual } : { status: "substituted", expected, actual });
      i -= 1;
      j -= 1;
      continue;
    }
    if (i > 0 && (op === "del" || j === 0)) {
      out.push({ status: "missing", expected: target[i - 1]!.raw });
      i -= 1;
      continue;
    }
    if (j > 0 && (op === "ins" || i === 0)) {
      out.push({ status: "extra", actual: transcript[j - 1]!.raw });
      j -= 1;
      continue;
    }
    break;
  }

  out.reverse();
  return out;
}
