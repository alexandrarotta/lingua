import type { Lesson, LessonIndex, LessonTargetPhrase } from "./types";

function packBasePath(langBase: string) {
  const base = langBase.trim().toLowerCase();
  if (!base || base === "en") return "/lessons";
  return `/lessons/${encodeURIComponent(base)}`;
}

function indexUrl(langBase: string) {
  return `${packBasePath(langBase)}/index.json`;
}

function lessonUrl(langBase: string, id: string) {
  return `${packBasePath(langBase)}/lessons/${encodeURIComponent(id)}.json`;
}

async function fetchJson(url: string, opts?: { notFoundMessage?: string }): Promise<unknown> {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    if (res.status === 404 && opts?.notFoundMessage) throw new Error(opts.notFoundMessage);
    throw new Error(`Failed to load ${url} (${res.status})`);
  }
  return (await res.json()) as unknown;
}

const cachedIndexByLang = new Map<string, LessonIndex>();
const cachedLessons = new Map<string, Lesson>();

export async function loadLessonIndex(langBase: string): Promise<LessonIndex> {
  const key = (langBase || "en").trim().toLowerCase() || "en";
  const cached = cachedIndexByLang.get(key);
  if (cached) return cached;
  const raw = await fetchJson(indexUrl(key), {
    notFoundMessage:
      key === "en"
        ? `No se encontró el pack de lecciones en ${indexUrl(key)}.`
        : `No hay pack de lecciones para "${key}". Crea uno en frontend/public/lessons/${key}/index.json`
  });
  const idx = raw as LessonIndex;
  cachedIndexByLang.set(key, idx);
  return idx;
}

export async function loadLesson(langBase: string, id: string): Promise<Lesson> {
  const key = `${(langBase || "en").trim().toLowerCase() || "en"}::${id}`;
  const cached = cachedLessons.get(key);
  if (cached) return cached;
  const raw = await fetchJson(lessonUrl(langBase, id));
  const lesson = normalizeLesson(raw);
  cachedLessons.set(key, lesson);
  return lesson;
}

type RawTargetPhrase = string | { text?: unknown; ipa?: unknown };

function normalizeTargetPhrases(raw: unknown): LessonTargetPhrase[] {
  if (!Array.isArray(raw)) return [];
  const out: LessonTargetPhrase[] = [];
  for (const item of raw as RawTargetPhrase[]) {
    if (typeof item === "string") {
      const text = item.trim();
      if (!text) continue;
      out.push({ text });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const text = typeof obj.text === "string" ? obj.text.trim() : "";
    if (!text) continue;
    const ipa = typeof obj.ipa === "string" ? obj.ipa.trim() : undefined;
    out.push({ text, ipa: ipa && ipa.trim() ? ipa : undefined });
  }
  return out;
}

function normalizeLesson(raw: unknown): Lesson {
  const obj = raw as Record<string, unknown>;
  const targetPhrases = normalizeTargetPhrases(obj.targetPhrases);
  return {
    ...(obj as unknown as Omit<Lesson, "targetPhrases">),
    targetPhrases
  };
}
