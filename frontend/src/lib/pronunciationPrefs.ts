export type PreferredAccent = "US" | "UK";

export type PronunciationGuideTabId = "chart" | "practice" | "issues";

const ACCENT_KEY = "lingua.pronunciation.preferredAccent";
const HINTS_KEY = "lingua.pronunciation.showHints";
const LAST_TAB_KEY = "lingua.pronunciation.lastTab";
const INLINE_IPA_GUIDE_KEY = "lingua.showIpaGuide";

export function getPreferredAccent(): PreferredAccent {
  try {
    const v = localStorage.getItem(ACCENT_KEY);
    if (v === "UK") return "UK";
    if (v === "US") return "US";
  } catch {
    // ignore
  }
  return "US";
}

export function setPreferredAccent(accent: PreferredAccent) {
  try {
    localStorage.setItem(ACCENT_KEY, accent);
  } catch {
    // ignore
  }
}

export function preferredAccentToLang(accent: PreferredAccent): string {
  return accent === "UK" ? "en-GB" : "en-US";
}

export function getPreferredEnglishLangTag(): string {
  return preferredAccentToLang(getPreferredAccent());
}

export function getShowPronunciationGuideHints(): boolean {
  try {
    const v = localStorage.getItem(HINTS_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    // ignore
  }
  return true;
}

export function setShowPronunciationGuideHints(enabled: boolean) {
  try {
    localStorage.setItem(HINTS_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
}

export function getPronunciationGuideLastTab(): PronunciationGuideTabId {
  try {
    const v = localStorage.getItem(LAST_TAB_KEY);
    if (v === "practice") return "practice";
    if (v === "issues") return "issues";
    if (v === "chart") return "chart";
  } catch {
    // ignore
  }
  return "chart";
}

export function setPronunciationGuideLastTab(tab: PronunciationGuideTabId) {
  try {
    localStorage.setItem(LAST_TAB_KEY, tab);
  } catch {
    // ignore
  }
}

export function getShowInlineIpaGuide(): boolean {
  try {
    const v = localStorage.getItem(INLINE_IPA_GUIDE_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    // ignore
  }
  return false;
}

export function setShowInlineIpaGuide(enabled: boolean) {
  try {
    localStorage.setItem(INLINE_IPA_GUIDE_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
}
