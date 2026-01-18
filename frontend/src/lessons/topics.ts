import type { LessonIndexItem, LessonLevel } from "./types";

export type LessonLevelFilter = LessonLevel | "ALL";

export function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase();
}

export function getTopicsForLevel(
  lessons: Array<Pick<LessonIndexItem, "level" | "topic">>,
  level: LessonLevelFilter
): string[] {
  const topicsByKey = new Map<string, string>();

  for (const l of lessons) {
    if (level !== "ALL" && l.level !== level) continue;
    const raw = l.topic ?? "";
    const display = raw.trim();
    if (!display) continue;
    const key = normalizeTopic(display);
    if (!key) continue;
    if (!topicsByKey.has(key)) topicsByKey.set(key, display);
  }

  return Array.from(topicsByKey.values()).sort((a, b) => {
    const ak = normalizeTopic(a);
    const bk = normalizeTopic(b);
    const c = ak.localeCompare(bk, undefined, { sensitivity: "base" });
    return c !== 0 ? c : a.localeCompare(b);
  });
}

