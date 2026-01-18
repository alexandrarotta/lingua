import { dictionary as CMU_DICT } from "cmu-pronouncing-dictionary";

export type IpaGuideRow = {
  key: string;
  display: string;
  approxEs: string;
  exampleEn: string;
};

export const IPA_GUIDE_ROWS: IpaGuideRow[] = [
  { key: "iː", display: "/iː/", approxEs: "i larga", exampleEn: "see" },
  { key: "ɪ", display: "/ɪ/", approxEs: "i corta (entre i/e)", exampleEn: "sit" },
  { key: "e", display: "/e/", approxEs: "e (como 'e' de 'mesa')", exampleEn: "bed" },
  { key: "æ", display: "/æ/", approxEs: "a abierta (sonido de 'cat')", exampleEn: "cat" },
  { key: "ʌ", display: "/ʌ/", approxEs: "a/ə corta (como 'uh')", exampleEn: "cup" },
  { key: "ɑː", display: "/ɑː/", approxEs: "a larga", exampleEn: "car" },
  { key: "ɒ", display: "/ɒ/ (UK)", approxEs: "o abierta corta (UK)", exampleEn: "hot" },
  { key: "ɔː", display: "/ɔː/", approxEs: "o larga", exampleEn: "thought" },
  { key: "ʊ", display: "/ʊ/", approxEs: "u corta", exampleEn: "book" },
  { key: "uː", display: "/uː/", approxEs: "u larga", exampleEn: "food" },
  { key: "ə", display: "/ə/", approxEs: "schwa (vocal neutra)", exampleEn: "about" },
  { key: "θ", display: "/θ/", approxEs: "z suave sin voz (lengua entre dientes)", exampleEn: "think" },
  { key: "ð", display: "/ð/", approxEs: "z suave con voz (lengua entre dientes)", exampleEn: "this" },
  { key: "v", display: "/v/", approxEs: "v sonora (no 'b')", exampleEn: "very" },
  { key: "z", display: "/z/", approxEs: "s sonora", exampleEn: "zoo" },
  { key: "ʃ", display: "/ʃ/", approxEs: "sh", exampleEn: "she" },
  { key: "tʃ", display: "/tʃ/", approxEs: "ch", exampleEn: "chair" },
  { key: "dʒ", display: "/dʒ/", approxEs: "j", exampleEn: "job" },
  { key: "r", display: "/r/", approxEs: "r inglesa (suave; no vibrante)", exampleEn: "red" },
  { key: "h", display: "/h/", approxEs: "h aspirada", exampleEn: "hello" },
  { key: "ˈ", display: "ˈ", approxEs: "acento principal (sílaba fuerte)", exampleEn: "aˈbout" },
  { key: "ˌ", display: "ˌ", approxEs: "acento secundario", exampleEn: "ˌunderˈstand" }
];

export function extractIpaSymbols(ipa: string): Set<string> {
  const raw = ipa.trim();
  if (!raw) return new Set();

  const keys = Array.from(new Set(IPA_GUIDE_ROWS.map((r) => r.key))).sort((a, b) => b.length - a.length);

  const found = new Set<string>();
  let working = raw;
  for (const k of keys) {
    if (!k) continue;
    if (!working.includes(k)) continue;
    found.add(k);
    working = working.split(k).join(" ");
  }
  return found;
}

const IPA_CACHE = new Map<string, string>();

const CONTRACTION_EXPANSIONS: Record<string, string[]> = {
  "i'm": ["i", "am"],
  "i'd": ["i", "would"],
  "i'll": ["i", "will"],
  "you're": ["you", "are"],
  "we're": ["we", "are"],
  "they're": ["they", "are"],
  "it's": ["it", "is"],
  "that's": ["that", "is"],
  "there's": ["there", "is"],
  "what's": ["what", "is"],
  "don't": ["do", "not"],
  "doesn't": ["does", "not"],
  "didn't": ["did", "not"],
  "can't": ["can", "not"]
};

const ARPABET_TO_IPA: Record<string, string> = {
  AA: "ɑː",
  AE: "æ",
  AH: "ʌ",
  AO: "ɔː",
  AW: "aʊ",
  AY: "aɪ",
  EH: "e",
  ER: "ɜːr",
  EY: "eɪ",
  IH: "ɪ",
  IY: "iː",
  OW: "oʊ",
  OY: "ɔɪ",
  UH: "ʊ",
  UW: "uː",
  AX: "ə",
  AXR: "ər",
  B: "b",
  CH: "tʃ",
  D: "d",
  DH: "ð",
  DX: "t",
  F: "f",
  G: "g",
  HH: "h",
  JH: "dʒ",
  K: "k",
  L: "l",
  M: "m",
  N: "n",
  NG: "ŋ",
  P: "p",
  R: "r",
  S: "s",
  SH: "ʃ",
  T: "t",
  TH: "θ",
  V: "v",
  W: "w",
  Y: "j",
  Z: "z",
  ZH: "ʒ"
};

function normalizeToken(token: string): string {
  return token
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\u2011/g, "-"); // non-breaking hyphen
}

function tokenizeForIpa(text: string): string[] {
  const normalized = text
    .replace(/[’‘]/g, "'")
    .replace(/[\u2011\u2012\u2013\u2014]/g, "-")
    .replace(/-/g, " ");

  const matches = normalized.match(/[A-Za-z]+(?:'[A-Za-z]+)?|\d{1,2}:\d{2}|\d+/g);
  if (!matches) return [];
  return matches.map((t) => normalizeToken(t)).filter(Boolean);
}

function numberToWords(n: number): string[] {
  const ones: Record<number, string> = {
    0: "zero",
    1: "one",
    2: "two",
    3: "three",
    4: "four",
    5: "five",
    6: "six",
    7: "seven",
    8: "eight",
    9: "nine",
    10: "ten",
    11: "eleven",
    12: "twelve",
    13: "thirteen",
    14: "fourteen",
    15: "fifteen",
    16: "sixteen",
    17: "seventeen",
    18: "eighteen",
    19: "nineteen"
  };
  const tens: Record<number, string> = {
    20: "twenty",
    30: "thirty",
    40: "forty",
    50: "fifty"
  };

  if (Number.isNaN(n) || !Number.isFinite(n) || n < 0) return [];
  if (n in ones) return [ones[n]];
  if (n in tens) return [tens[n]];
  if (n > 20 && n < 60) {
    const t = Math.floor(n / 10) * 10;
    const o = n % 10;
    if (t in tens && o in ones) return [tens[t], ones[o]];
  }
  return [];
}

function expandNumericToken(token: string): string[] {
  if (/^\d{1,2}:\d{2}$/.test(token)) {
    const [hRaw, mRaw] = token.split(":");
    const h = Number.parseInt(hRaw, 10);
    const m = Number.parseInt(mRaw, 10);
    const hWords = numberToWords(h);
    const mWords = numberToWords(m);
    const combined = [...hWords, ...mWords];
    return combined.length ? combined : [token];
  }
  if (/^\d+$/.test(token)) {
    const n = Number.parseInt(token, 10);
    const words = numberToWords(n);
    return words.length ? words : [token];
  }
  return [token];
}

function isVowelArpabet(base: string): boolean {
  return (
    base === "AA" ||
    base === "AE" ||
    base === "AH" ||
    base === "AO" ||
    base === "AW" ||
    base === "AY" ||
    base === "EH" ||
    base === "ER" ||
    base === "EY" ||
    base === "IH" ||
    base === "IY" ||
    base === "OW" ||
    base === "OY" ||
    base === "UH" ||
    base === "UW" ||
    base === "AX" ||
    base === "AXR"
  );
}

function arpabetToIpaWord(arpabet: string): string {
  const tokens = arpabet.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];

  for (const rawToken of tokens) {
    const m = rawToken.toUpperCase().match(/^([A-Z]+)([0-2])?$/);
    if (!m) continue;
    const base = m[1];
    const stress = m[2] ?? "";

    let ipa = ARPABET_TO_IPA[base] ?? "";
    if (!ipa) {
      out.push(base.toLowerCase());
      continue;
    }

    if (base === "AH") {
      if (stress === "0") ipa = "ə";
      else ipa = "ʌ";
    }

    const stressMark = stress === "1" ? "ˈ" : stress === "2" ? "ˌ" : "";
    if (stressMark && isVowelArpabet(base)) out.push(stressMark + ipa);
    else out.push(ipa);
  }

  return out.join("");
}

function fallbackWordToIpa(word: string): string {
  const w = word.replace(/'/g, "");
  if (!w) return "";

  const pairs: Array<[RegExp, string]> = [
    [/^th/, "θ"],
    [/^sh/, "ʃ"],
    [/^ch/, "tʃ"],
    [/^ph/, "f"],
    [/ng$/, "ŋ"],
    [/ee/, "iː"],
    [/oo/, "uː"],
    [/ai|ay/, "eɪ"]
  ];
  let working = w;
  for (const [re, rep] of pairs) working = working.replace(re, rep);

  const mapChar = (c: string): string => {
    switch (c) {
      case "a":
        return "æ";
      case "e":
        return "e";
      case "i":
        return "ɪ";
      case "o":
        return "ɒ";
      case "u":
        return "ʌ";
      case "y":
        return "j";
      case "c":
        return "k";
      case "q":
        return "k";
      case "x":
        return "ks";
      default:
        return c;
    }
  };

  return Array.from(working).map(mapChar).join("");
}

function wordsToIpa(words: string[]): string[] {
  const out: string[] = [];
  for (const word of words) {
    const expanded = CONTRACTION_EXPANSIONS[word] ?? [word];
    for (const w0 of expanded) {
      const w = w0.toLowerCase();
      const arpabet = CMU_DICT[w];
      if (arpabet) out.push(arpabetToIpaWord(arpabet));
      else out.push(fallbackWordToIpa(w) || w);
    }
  }
  return out.filter(Boolean);
}

function tokenizeForItalianIpa(text: string): string[] {
  const normalized = text
    .replace(/[’‘‛ʼ]/g, "'")
    .replace(/[\u2011\u2012\u2013\u2014]/g, "-")
    .replace(/-/g, " ");

  const matches = normalized.match(/[\p{L}\p{N}']+/gu);
  return matches ? matches.map((t) => t.trim()).filter(Boolean) : [];
}

function italianWordToIpa(word: string): string {
  const w = word
    .trim()
    .toLowerCase()
    .replace(/[’‘‛ʼ]/g, "'")
    .replace(/'/g, "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "");
  if (!w) return "";

  const out: string[] = [];
  let i = 0;
  while (i < w.length) {
    const next3 = w.slice(i, i + 3);
    const next2 = w.slice(i, i + 2);
    const next1 = w[i] ?? "";
    const after1 = w[i + 1] ?? "";
    const after2 = w[i + 2] ?? "";

    if (next3 === "gli") {
      out.push("ʎ");
      i += 2; // keep the "i" as vowel
      continue;
    }
    if (next2 === "gn") {
      out.push("ɲ");
      i += 2;
      continue;
    }
    if (next2 === "qu") {
      out.push("kw");
      i += 2;
      continue;
    }
    if (next3 === "sch") {
      out.push("sk");
      i += 3;
      continue;
    }
    if (next2 === "ch") {
      out.push("k");
      i += 2;
      continue;
    }
    if (next2 === "gh") {
      out.push("g");
      i += 2;
      continue;
    }
    if (next2 === "sc" && (after2 === "e" || after2 === "i")) {
      out.push("ʃ");
      i += 2;
      continue;
    }
    if (next2 === "ci" && (after2 === "a" || after2 === "o" || after2 === "u")) {
      out.push("tʃ");
      i += 2;
      continue;
    }
    if (next2 === "gi" && (after2 === "a" || after2 === "o" || after2 === "u")) {
      out.push("dʒ");
      i += 2;
      continue;
    }
    if (next1 === "c" && (after1 === "e" || after1 === "i")) {
      out.push("tʃ");
      i += 1;
      continue;
    }
    if (next1 === "g" && (after1 === "e" || after1 === "i")) {
      out.push("dʒ");
      i += 1;
      continue;
    }
    if (next1 === "h") {
      i += 1;
      continue;
    }

    if (next1 === "a") out.push("a");
    else if (next1 === "e") out.push("e");
    else if (next1 === "i") out.push("i");
    else if (next1 === "o") out.push("o");
    else if (next1 === "u") out.push("u");
    else if (next1 === "b") out.push("b");
    else if (next1 === "d") out.push("d");
    else if (next1 === "f") out.push("f");
    else if (next1 === "l") out.push("l");
    else if (next1 === "m") out.push("m");
    else if (next1 === "n") out.push("n");
    else if (next1 === "p") out.push("p");
    else if (next1 === "r") out.push("r");
    else if (next1 === "s") out.push("s");
    else if (next1 === "t") out.push("t");
    else if (next1 === "v") out.push("v");
    else if (next1 === "z") out.push("ts");
    else if (next1 === "c") out.push("k");
    else if (next1 === "g") out.push("g");
    else if (next1 === "x") out.push("ks");
    else if (next1 === "y") out.push("i");
    else if (next1 === "w") out.push("w");
    else if (next1 === "k") out.push("k");
    else if (next1 === "j") out.push("j");

    i += 1;
  }

  return out.join("");
}

function toItalianIpa(text: string): string {
  const key = text.trim();
  if (!key) return "/…/";
  const cacheKey = `it:${key}`;
  const cached = IPA_CACHE.get(cacheKey);
  if (cached) return cached;

  const tokens = tokenizeForItalianIpa(text)
    .map((t) => t.replace(/[^\p{L}\p{N}']/gu, ""))
    .filter(Boolean);
  const ipaWords = tokens.map((w) => italianWordToIpa(w)).filter(Boolean);
  const result = `/${ipaWords.join(" ").replace(/\s+/g, " ").trim() || "…"}/`;
  IPA_CACHE.set(cacheKey, result);
  return result;
}

export function toIpaForLang(text: string, langBase: string): string {
  const base = (langBase || "en").trim().toLowerCase() || "en";
  if (base === "en") return toIpa(text);
  if (base === "it") return toItalianIpa(text);
  return "";
}

export function toIpa(text: string): string {
  const key = text.trim();
  if (!key) return "/…/";
  const cached = IPA_CACHE.get(key);
  if (cached) return cached;

  const tokens = tokenizeForIpa(text);
  const expandedTokens = tokens.flatMap((t) => expandNumericToken(t));
  const ipaWords = wordsToIpa(expandedTokens);

  const result = `/${ipaWords.join(" ").replace(/\s+/g, " ").trim() || "…"}/`;
  IPA_CACHE.set(key, result);
  return result;
}
