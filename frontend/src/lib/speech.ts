import { resolveLearningLangTag } from "./learningLangPrefs";

export function isSpeechRecognitionAvailable() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function createSpeechRecognition() {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;
  return new Ctor();
}

function getIsSecureContextSafe(): boolean {
  try {
    return typeof window !== "undefined" && "isSecureContext" in window && !!window.isSecureContext;
  } catch {
    return true;
  }
}

export function isVoiceSecureContext(): boolean {
  return getIsSecureContextSafe();
}

export function formatSpeechRecognitionError(e: { error?: string; message?: string } | null | undefined): string {
  const raw = (e && (typeof e.error === "string" ? e.error : typeof e.message === "string" ? e.message : "")) || "unknown";
  const code = raw.trim() || "unknown";
  const lower = code.toLowerCase();

  if (lower === "not-allowed" || lower === "service-not-allowed") {
    if (!getIsSecureContextSafe()) {
      return "Micrófono bloqueado: el sitio no es seguro (HTTP). Si abriste por IP/LAN, usa HTTPS o abre desde localhost.";
    }
    return "Micrófono bloqueado: permiso denegado. Permite micrófono en el navegador y recarga.";
  }

  if (lower === "audio-capture") return "No se detectó micrófono. Revisa que haya uno disponible y permisos.";
  if (lower === "no-speech") return "No se detectó voz. Intenta de nuevo y habla cerca del micrófono.";
  if (lower === "network") return "Error de red en SpeechRecognition. Intenta de nuevo.";
  if (lower === "aborted") return "STT cancelado.";
  if (lower === "language-not-supported") return "Idioma no soportado por SpeechRecognition.";

  return `STT error: ${code}`;
}

export function speak(text: string, opts?: { lang?: string; rate?: number }) {
  if (!("speechSynthesis" in window)) return false;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = opts?.lang ?? resolveLearningLangTag();
  utterance.rate = opts?.rate ?? 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}
