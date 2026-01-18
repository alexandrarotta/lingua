import { z } from "zod";
import { createProvider } from "../ai/providerFactory.js";
import { AiHttpError, isErrnoLike } from "../ai/errors.js";
import type { AiConfig } from "../ai/types.js";
import { diffTokens } from "../pronunciation/diffTokens.js";

const ProviderSchema = z.enum(["MOCK", "LM_STUDIO_OPENAI_COMPAT", "ANYTHINGLLM_DEV_API"]);

export const CoachTurnRequestSchema = z.object({
  sessionId: z.string().optional(),
  transcriptText: z.string().min(1),
  targetText: z.string().optional(),
  learningLanguageTag: z.string().optional(),
  conversation: z
    .object({
      messages: z
        .array(
          z.object({
            role: z.enum(["system", "user", "assistant"]),
            content: z.string()
          })
        )
        .default([])
    })
    .optional(),
  ai: z
    .object({
      providerType: ProviderSchema.default("MOCK"),
      baseUrl: z.string().optional(),
      model: z.string().optional(),
      workspaceSlug: z.string().optional(),
      anythingllmMode: z.enum(["chat", "query"]).optional()
    })
    .optional()
});

export type CoachTurnRequest = z.infer<typeof CoachTurnRequestSchema>;

const CoachAiJsonSchema = z.object({
  correctedUserText: z.string(),
  explanationEs: z.string(),
  styleSuggestions: z.array(z.string()).default([]),
  assistantReplyText: z.string()
});

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function getCause(err: unknown): unknown {
  if (!err || typeof err !== "object") return undefined;
  if (!("cause" in err)) return undefined;
  return (err as { cause?: unknown }).cause;
}

function humanizeProviderError(err: unknown): string {
  const cause = getCause(err);
  if (isErrnoLike(cause) && cause.code === "ECONNREFUSED") return "Servidor local no está levantado";
  if (isErrnoLike(err) && err.code === "ECONNREFUSED") return "Servidor local no está levantado";

  if (err instanceof AiHttpError) {
    if (err.status === 401) return "API key inválida";
    if (err.status === 404) return "Endpoint incorrecto (revisar baseUrl/paths)";
    return `Error HTTP ${err.status}${err.code ? ` (${err.code})` : ""}`;
  }

  return err instanceof Error ? err.message : "AI provider failed; using MOCK.";
}

function normalizeLangTag(tag: string | undefined): string {
  const t = (tag ?? "").trim();
  return t || "en-US";
}

function languageNameEsFromTag(tag: string): string {
  const base = tag.split("-")[0]?.toLowerCase() ?? "";
  if (base === "en") return "inglés";
  if (base === "it") return "italiano";
  if (base === "fr") return "francés";
  if (base === "ru") return "ruso";
  if (base === "el") return "griego";
  return tag;
}

function capitalizeFirst(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const chars = Array.from(trimmed);
  chars[0] = chars[0]!.toUpperCase();
  return chars.join("");
}

function assistantReplyFallback(learningLanguageTag: string): string {
  const base = learningLanguageTag.split("-")[0]?.toLowerCase() ?? "";
  if (base === "it") return "Grazie! Raccontami di più.";
  if (base === "fr") return "Merci ! Dis-m'en plus.";
  if (base === "ru") return "Спасибо! Расскажи подробнее.";
  if (base === "el") return "Ευχαριστώ! Πες μου περισσότερα.";
  return "Thanks! Tell me more about that.";
}

function fallbackCorrection(transcriptText: string, learningLanguageTag: string) {
  const corrected = capitalizeFirst(transcriptText.trim().replace(/\s+/g, " "));
  return {
    correctedUserText: corrected,
    explanationEs:
      "Corrección aproximada (modo MOCK). Si conectas un modelo local, la corrección será más precisa.",
    styleSuggestions: [
      "Usa frases completas (sujeto + verbo + detalle).",
      "Añade un ejemplo concreto o un dato (cuándo, dónde, por qué).",
      "Repite la idea con palabras distintas para ganar fluidez."
    ],
    assistantReplyText: assistantReplyFallback(learningLanguageTag)
  };
}

function formatConversation(messages: Array<{ role: string; content: string }>) {
  const trimmed = messages.slice(-10);
  return trimmed
    .map((m) => {
      const role = m.role === "assistant" ? "Assistant" : m.role === "user" ? "User" : "System";
      return `${role}: ${m.content}`;
    })
    .join("\n");
}

function buildSystemPrompt(learningLanguageTag: string) {
  const langNameEs = languageNameEsFromTag(learningLanguageTag);
  return [
    `Eres un coach de ${langNameEs} para hispanohablantes.`,
    `Idioma objetivo (BCP-47): ${learningLanguageTag}.`,
    "Tu tarea en cada turno:",
    `1) corregir gramática/ortografía del texto del usuario en ${langNameEs} (sin cambiar el significado)`,
    "2) explicar brevemente en español (1-2 frases)",
    `3) dar 2-4 sugerencias de estilo en español para sonar más natural en ${langNameEs} (strings cortos)`,
    `4) responder como asistente en ${langNameEs}, natural y conversacional (1-3 frases), haciendo una pregunta para continuar.`,
    "",
    "Salida: SOLO JSON válido con las claves:",
    "correctedUserText, explanationEs, styleSuggestions, assistantReplyText.",
    "No incluyas markdown ni texto adicional."
  ].join("\n");
}

export async function runCoachTurn(
  input: CoachTurnRequest,
  opts?: { logger?: { info?: (obj: unknown, msg?: string) => void; debug?: (obj: unknown, msg?: string) => void }; apiKey?: string }
) {
  const transcriptText = input.transcriptText.trim();
  const learningLanguageTag = normalizeLangTag(input.learningLanguageTag);
  const ai: AiConfig = {
    providerType: input.ai?.providerType ?? "MOCK",
    baseUrl: input.ai?.baseUrl,
    model: input.ai?.model,
    apiKey: opts?.apiKey,
    workspaceSlug: input.ai?.workspaceSlug,
    anythingllmMode: input.ai?.anythingllmMode
  };

  const providerConfigured = ai.providerType;

  const history = input.conversation?.messages ?? [];
  const conversationText = history.length ? formatConversation(history) : "";
  const userPayload =
    providerConfigured === "ANYTHINGLLM_DEV_API" && input.sessionId
      ? `User said:\n${transcriptText}`
      : conversationText
        ? `Conversation so far:\n${conversationText}\n\nCurrent user said:\n${transcriptText}`
        : `User said:\n${transcriptText}`;
  let providerUsed: AiConfig["providerType"] = providerConfigured;

  let coachResult = fallbackCorrection(transcriptText, learningLanguageTag);
  let warning: string | undefined;

  if (providerConfigured !== "MOCK") {
    try {
      const provider = createProvider(ai, opts);
      const model = providerConfigured === "LM_STUDIO_OPENAI_COMPAT" ? ai.model?.trim() : undefined;
      if (providerConfigured === "LM_STUDIO_OPENAI_COMPAT" && !model) {
        throw new Error("Missing model for OpenAI-compatible provider.");
      }

      const completion = await provider.chatCompletion({
        model,
        messages: [
          { role: "system", content: buildSystemPrompt(learningLanguageTag) },
          { role: "user", content: userPayload }
        ],
        temperature: 0.4,
        sessionId: input.sessionId
      });

      const raw = completion.content.trim();
      const parsed = safeJsonParse(raw);
      const validated = parsed ? CoachAiJsonSchema.safeParse(parsed) : null;
      if (!validated?.success) {
        const fallback = fallbackCorrection(transcriptText, learningLanguageTag);
        coachResult = { ...fallback, assistantReplyText: raw || fallback.assistantReplyText };
        warning = "AI response was not valid JSON; used MOCK for correction fields.";
      } else {
        coachResult = validated.data;
      }
    } catch (err) {
      providerUsed = "MOCK";
      warning = humanizeProviderError(err);
    }
  }

  const correctedUserText = coachResult.correctedUserText || transcriptText;
  const targetText = (input.targetText?.trim() || correctedUserText).trim();

  const pronunciationTokens = diffTokens(targetText, transcriptText);

  return {
    ok: true as const,
    transcriptText,
    correctedUserText,
    explanationEs: coachResult.explanationEs,
    styleSuggestions: coachResult.styleSuggestions,
    assistantReplyText: coachResult.assistantReplyText,
    targetText,
    pronunciationTokens,
    providerUsed,
    warning
  };
}
