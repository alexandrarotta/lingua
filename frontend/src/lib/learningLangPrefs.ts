import { getPreferredEnglishLangTag } from "./pronunciationPrefs";

export type LearningLangSetting = "auto" | string;

const LEARNING_LANG_KEY = "lingua.learning.langTag";
const LEGACY_CHAT_LANG_KEY = "lingua.chat.langTag";

export function getLearningLangSetting(): LearningLangSetting {
  try {
    const v = localStorage.getItem(LEARNING_LANG_KEY) ?? localStorage.getItem(LEGACY_CHAT_LANG_KEY);
    if (!v) return "auto";
    if (v === "auto") return "auto";
    return v;
  } catch {
    return "auto";
  }
}

export function setLearningLangSetting(setting: LearningLangSetting) {
  const next = typeof setting === "string" ? setting.trim() : "auto";
  try {
    const v = next ? next : "auto";
    localStorage.setItem(LEARNING_LANG_KEY, v);
    localStorage.setItem(LEGACY_CHAT_LANG_KEY, v);
  } catch {
    // ignore
  }
}

export function resolveLearningLangTag(setting?: LearningLangSetting): string {
  const s = setting ?? getLearningLangSetting();
  if (s === "auto") return getPreferredEnglishLangTag();
  return s || getPreferredEnglishLangTag();
}

export function learningLangBaseFromTag(tag: string): string {
  const t = (tag || "").trim();
  const base = t.split("-")[0]?.toLowerCase() ?? "";
  return base || "en";
}
