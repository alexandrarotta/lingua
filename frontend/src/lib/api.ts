import type { PronunciationToken } from "./diffTokens";
import type { AiProfile } from "../state/aiProfiles";

export type CoachTurnResponse = {
  ok: true;
  transcriptText: string;
  correctedUserText: string;
  explanationEs: string;
  styleSuggestions: string[];
  assistantReplyText: string;
  targetText: string;
  pronunciationTokens: PronunciationToken[];
  providerUsed: string;
  warning?: string;
};

export function profileToAiConfig(profile: AiProfile) {
  return {
    providerType: profile.providerType,
    baseUrl: profile.baseUrl,
    model: profile.model,
    workspaceSlug: profile.workspaceSlug,
    anythingllmMode: profile.anythingllmMode
  };
}

export async function coachTurn(input: {
  transcriptText: string;
  targetText?: string;
  sessionId?: string;
  conversationMessages?: Array<{ role: "user" | "assistant"; content: string }>;
  learningLanguageTag?: string;
  profile: AiProfile;
  apiKey?: string;
}) {
  const body = {
    transcriptText: input.transcriptText,
    targetText: input.targetText,
    sessionId: input.sessionId,
    learningLanguageTag: input.learningLanguageTag,
    conversation: { messages: input.conversationMessages ?? [] },
    ai: profileToAiConfig(input.profile)
  };

  const res = await fetch("/api/coach/turn", {
    method: "POST",
    headers: { "content-type": "application/json", ...(input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {}) },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Backend error (${res.status}): ${text}`.slice(0, 300));
  }

  return (await res.json()) as CoachTurnResponse;
}

export async function testAiConnection(input: {
  profile: AiProfile;
  apiKey?: string;
}): Promise<{ ok: boolean; message: string }> {
  const res = await fetch("/api/ai/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {})
    },
    body: JSON.stringify({ ai: profileToAiConfig(input.profile) })
  });
  const json = (await res.json()) as { ok: boolean; message?: string };
  return { ok: !!json.ok, message: json.message ?? (json.ok ? "ok" : "failed") };
}

export async function fetchModels(input: {
  profile: AiProfile;
  apiKey?: string;
}): Promise<{ models: string[]; message?: string }> {
  const qs = new URLSearchParams({
    providerType: input.profile.providerType,
    baseUrl: input.profile.baseUrl
  });

  const res = await fetch(`/api/ai/models?${qs.toString()}`, {
    headers: input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {}
  });
  const json = (await res.json()) as { ok: boolean; models?: string[]; message?: string };
  return { models: json.models ?? [], message: json.message };
}

export async function fetchWorkspaces(input: {
  profile: AiProfile;
  apiKey?: string;
}): Promise<{ workspaces: string[]; message?: string }> {
  const qs = new URLSearchParams({
    providerType: input.profile.providerType,
    baseUrl: input.profile.baseUrl
  });

  const res = await fetch(`/api/ai/workspaces?${qs.toString()}`, {
    headers: input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {}
  });
  const json = (await res.json()) as { ok: boolean; workspaces?: string[]; message?: string };
  return { workspaces: json.workspaces ?? [], message: json.message };
}

export type LessonExtraDrill = {
  type: "repeat" | "fill_blank" | "reorder" | "mini_dialogue";
  promptEn: string;
  answerEn?: string;
  tipEs?: string;
};

export type LessonsCoachOkResponse = {
  ok: true;
  providerType: string;
  extraDrills: LessonExtraDrill[];
  roleplayPrompts: string[];
  feedbackSummaryEs: string;
  warning?: string;
};

export type LessonsCoachErrResponse = {
  ok: false;
  providerType?: string;
  message?: string;
  error?: string;
};

export async function lessonsCoach(input: {
  lessonId: string;
  learningLanguageTag?: string;
  lesson?: {
    level?: "A1" | "A2";
    topic?: string;
    titleEn?: string;
    targetPhrases?: string[];
    vocabList?: Array<{ en: string; es?: string }>;
    conversationScenario?: { roleplayEn?: string; promptsEn?: string[] };
  };
  userState?: {
    lowAccuracyPhrases?: string[];
    wrongTerms?: string[];
    quizPct?: number;
  };
  profile: AiProfile;
  apiKey?: string;
}): Promise<LessonsCoachOkResponse | LessonsCoachErrResponse> {
  const res = await fetch("/api/lessons/coach", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {})
    },
    body: JSON.stringify({
      lessonId: input.lessonId,
      learningLanguageTag: input.learningLanguageTag,
      lesson: input.lesson,
      userState: input.userState,
      ai: profileToAiConfig(input.profile)
    })
  });

  let payload: unknown = null;
  try {
    payload = (await res.json()) as unknown;
  } catch {
    const text = await res.text().catch(() => "");
    return { ok: false, message: `Backend error (${res.status}): ${text}`.slice(0, 300) };
  }

  if (res.ok) {
    const ok = payload as LessonsCoachOkResponse;
    if (ok && ok.ok) return ok;
    return { ok: false, message: "Unexpected response from backend." };
  }

  const err = payload as LessonsCoachErrResponse;
  return { ok: false, providerType: err.providerType, message: err.message ?? err.error ?? "Request failed." };
}
