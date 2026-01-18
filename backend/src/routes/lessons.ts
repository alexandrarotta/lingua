import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createProvider } from "../ai/providerFactory.js";
import type { AiConfig } from "../ai/types.js";
import { AiHttpError, isErrnoLike } from "../ai/errors.js";

const ProviderSchema = z.enum(["MOCK", "LM_STUDIO_OPENAI_COMPAT", "ANYTHINGLLM_DEV_API"]);

const LessonsCoachRequestSchema = z.object({
  lessonId: z.string().min(1),
  learningLanguageTag: z.string().optional(),
  lesson: z
    .object({
      level: z.enum(["A1", "A2"]).optional(),
      topic: z.string().optional(),
      titleEn: z.string().optional(),
      targetPhrases: z.array(z.string()).optional(),
      vocabList: z.array(z.object({ en: z.string(), es: z.string().optional() })).optional(),
      conversationScenario: z
        .object({
          roleplayEn: z.string().optional(),
          promptsEn: z.array(z.string()).optional()
        })
        .optional()
    })
    .optional(),
  userState: z
    .object({
      lowAccuracyPhrases: z.array(z.string()).optional(),
      wrongTerms: z.array(z.string()).optional(),
      quizPct: z.number().min(0).max(1).optional()
    })
    .optional(),
  ai: z.object({
    providerType: ProviderSchema.default("MOCK"),
    baseUrl: z.string().optional(),
    model: z.string().optional(),
    workspaceSlug: z.string().optional(),
    anythingllmMode: z.enum(["chat", "query"]).optional()
  })
});

const LessonCoachResponseSchema = z.object({
  extraDrills: z
    .array(
      z.object({
        type: z.enum(["repeat", "fill_blank", "reorder", "mini_dialogue"]),
        promptEn: z.string(),
        answerEn: z.string().optional(),
        tipEs: z.string().optional()
      })
    )
    .default([]),
  roleplayPrompts: z.array(z.string()).default([]),
  feedbackSummaryEs: z.string().default("")
});

function apiKeyFromHeaders(headers: Record<string, unknown>): string | undefined {
  const xApiKey = headers["x-api-key"];
  if (typeof xApiKey === "string" && xApiKey.trim()) return xApiKey.trim();

  const auth = headers["authorization"];
  if (typeof auth === "string") {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract a JSON object from surrounding text.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const chunk = text.slice(start, end + 1);
      try {
        return JSON.parse(chunk);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function mapError(err: unknown): { statusCode: number; message: string } {
  const cause = err && typeof err === "object" && "cause" in err ? (err as { cause?: unknown }).cause : undefined;
  if (isErrnoLike(cause) && cause.code === "ECONNREFUSED") return { statusCode: 504, message: "Servidor local no está levantado" };
  if (isErrnoLike(err) && err.code === "ECONNREFUSED") return { statusCode: 504, message: "Servidor local no está levantado" };

  if (err instanceof AiHttpError) {
    if (err.status === 401) return { statusCode: 502, message: "API key inválida" };
    if (err.status === 404) return { statusCode: 502, message: "Endpoint incorrecto (revisar baseUrl/paths)" };
    return { statusCode: 502, message: `Error HTTP ${err.status}${err.code ? ` (${err.code})` : ""}` };
  }
  return { statusCode: 502, message: err instanceof Error ? err.message : "Request failed." };
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

function buildLessonsCoachSystemPrompt(learningLanguageTag: string) {
  const langNameEs = languageNameEsFromTag(learningLanguageTag);
  return [
    `Eres un tutor de ${langNameEs} para hispanohablantes (nivel A1–A2).`,
    `Idioma objetivo (BCP-47): ${learningLanguageTag}.`,
    "Genera práctica extra con baja carga cognitiva (pasos cortos, feedback claro).",
    "",
    "Devuelve SOLO JSON válido con estas claves:",
    "1) feedbackSummaryEs: string (3-5 puntos cortos en español).",
    "2) extraDrills: array (3-5 items). Cada item:",
    '   { "type": "repeat"|"fill_blank"|"reorder"|"mini_dialogue", "promptEn": string, "answerEn"?: string, "tipEs"?: string }',
    `3) roleplayPrompts: array de 5 prompts en ${langNameEs} (turnos de roleplay).`,
    "",
    "Reglas:",
    "- No uses markdown.",
    "- Mantén el vocabulario acorde al nivel.",
    "- Si hay frases con baja precisión, crea drills centrados en esas frases."
  ].join("\n");
}

export function registerLessonsRoutes(app: FastifyInstance) {
  app.post("/api/lessons/coach", async (req, reply) => {
    const parsed = LessonsCoachRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: "Invalid request" });
    }

    const apiKey = apiKeyFromHeaders(req.headers as Record<string, unknown>);
    const ai: AiConfig = { ...parsed.data.ai, apiKey } satisfies AiConfig;
    const learningLanguageTag = normalizeLangTag(parsed.data.learningLanguageTag);

    if (ai.providerType === "MOCK") {
      const prompts = parsed.data.lesson?.conversationScenario?.promptsEn ?? [];
      return reply.send({
        ok: true,
        providerType: "MOCK",
        extraDrills: [],
        roleplayPrompts: prompts.slice(0, 5),
        feedbackSummaryEs: "Sin IA: usa las frases objetivo y el modo Review para repasar."
      });
    }

    // Validate minimal required config.
    if (!ai.baseUrl?.trim()) return reply.status(400).send({ ok: false, message: "Missing baseUrl." });
    if (ai.providerType === "LM_STUDIO_OPENAI_COMPAT" && !ai.model?.trim()) {
      return reply.status(400).send({ ok: false, message: "Missing model for OpenAI-compatible provider." });
    }
    if (ai.providerType === "ANYTHINGLLM_DEV_API") {
      if (!apiKey?.trim()) return reply.status(400).send({ ok: false, message: "Missing API key for AnythingLLM." });
      if (!ai.workspaceSlug?.trim()) return reply.status(400).send({ ok: false, message: "Missing workspaceSlug for AnythingLLM." });
    }

    const lessonContext = {
      lessonId: parsed.data.lessonId,
      lesson: parsed.data.lesson ?? {},
      userState: parsed.data.userState ?? {}
    };

    try {
      const provider = createProvider(ai, { logger: req.log });
      const completion = await provider.chatCompletion({
        model: ai.model,
        sessionId: `lingua-lesson-${parsed.data.lessonId}`,
        messages: [
          { role: "system", content: buildLessonsCoachSystemPrompt(learningLanguageTag) },
          { role: "user", content: JSON.stringify(lessonContext) }
        ],
        temperature: 0.4
      });

      const raw = completion.content.trim();
      const parsedJson = safeJsonParse(raw);
      const validated = parsedJson ? LessonCoachResponseSchema.safeParse(parsedJson) : null;
      if (!validated?.success) {
        const prompts = parsed.data.lesson?.conversationScenario?.promptsEn ?? [];
        return reply.send({
          ok: true,
          providerType: ai.providerType,
          extraDrills: [],
          roleplayPrompts: prompts.slice(0, 5),
          feedbackSummaryEs:
            "La IA no devolvió JSON válido. Usa las frases objetivo y el modo Review para repasar.",
          warning: "AI response was not valid JSON."
        });
      }

      return reply.send({ ok: true, providerType: ai.providerType, ...validated.data });
    } catch (err) {
      const mapped = mapError(err);
      return reply.status(mapped.statusCode).send({ ok: false, providerType: ai.providerType, message: mapped.message });
    }
  });
}
