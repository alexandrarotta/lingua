import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createProvider } from "../ai/providerFactory.js";
import type { AiConfig, ProviderId } from "../ai/types.js";
import { normalizeAnythingLlmBaseUrl } from "../ai/anythingllmUrls.js";
import { AiHttpError, isErrnoLike } from "../ai/errors.js";
import { normalizeOpenAiCompatBaseUrl } from "../ai/openaiUrls.js";

const ProviderSchema = z.enum(["MOCK", "LM_STUDIO_OPENAI_COMPAT", "ANYTHINGLLM_DEV_API"]);

const AiConfigSchema = z.object({
  providerType: ProviderSchema,
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  workspaceSlug: z.string().optional(),
  anythingllmMode: z.enum(["chat", "query"]).optional()
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

export function registerAiRoutes(app: FastifyInstance) {
  function getCause(err: unknown): unknown {
    if (!err || typeof err !== "object") return undefined;
    if (!("cause" in err)) return undefined;
    return (err as { cause?: unknown }).cause;
  }

  function mapError(err: unknown): { statusCode: number; message: string } {
    const cause = getCause(err);
    if (isErrnoLike(cause) && cause.code === "ECONNREFUSED") {
      return { statusCode: 504, message: "Servidor local no está levantado" };
    }
    if (isErrnoLike(err) && err.code === "ECONNREFUSED") {
      return { statusCode: 504, message: "Servidor local no está levantado" };
    }

    if (err instanceof AiHttpError) {
      if (err.status === 401) return { statusCode: 502, message: "API key inválida" };
      if (err.status === 404) return { statusCode: 502, message: "Endpoint incorrecto (revisar baseUrl/paths)" };
      return { statusCode: 502, message: `Error HTTP ${err.status}${err.code ? ` (${err.code})` : ""}` };
    }
    return { statusCode: 502, message: err instanceof Error ? err.message : "Request failed." };
  }

  app.post("/api/ai/test", async (req, reply) => {
    const parsed = z
      .object({
        ai: AiConfigSchema
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: "Invalid request" });
    }

    const ai = parsed.data.ai satisfies AiConfig;
    const apiKey = apiKeyFromHeaders(req.headers as Record<string, unknown>);
    const withKey: AiConfig = { ...ai, apiKey };

    if (withKey.providerType === "MOCK") {
      return reply.send({ ok: true, providerType: "MOCK", message: "MOCK is always available." });
    }

    try {
      const rawBaseUrl = withKey.baseUrl?.trim() ?? "";
      if (!rawBaseUrl) return reply.status(400).send({ ok: false, providerType: withKey.providerType, message: "Missing baseUrl." });

      if (withKey.providerType === "LM_STUDIO_OPENAI_COMPAT") {
        withKey.baseUrl = normalizeOpenAiCompatBaseUrl(rawBaseUrl);
      } else if (withKey.providerType === "ANYTHINGLLM_DEV_API") {
        withKey.baseUrl = normalizeAnythingLlmBaseUrl(rawBaseUrl);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid configuration.";
      return reply.status(400).send({ ok: false, providerType: withKey.providerType, message });
    }

    try {
      const provider = createProvider(withKey, { logger: req.log });
      const res = await provider.testConnection?.();
      if (!res) return reply.status(500).send({ ok: false, message: "Provider has no testConnection()." });
      if (!res.ok) return reply.status(400).send({ ok: false, message: res.message });
      return reply.send({ ok: true, providerType: withKey.providerType, message: res.message });
    } catch (err) {
      const mapped = mapError(err);
      return reply.status(mapped.statusCode).send({ ok: false, providerType: withKey.providerType, message: mapped.message });
    }
  });

  app.get("/api/ai/models", async (req, reply) => {
    const parsed = z
      .object({
        providerType: ProviderSchema.default("MOCK"),
        baseUrl: z.string().optional()
      })
      .safeParse(req.query);

    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: "Invalid query" });
    }

    const apiKey = apiKeyFromHeaders(req.headers as Record<string, unknown>);

    const providerType = parsed.data.providerType as ProviderId;
    if (providerType === "MOCK") {
      return reply.send({ ok: true, models: [], message: "MOCK has no models." });
    }
    if (providerType !== "LM_STUDIO_OPENAI_COMPAT") {
      return reply.status(400).send({ ok: false, models: [], message: "Models not supported for this provider (use workspaces)." });
    }

    const ai: AiConfig = { providerType, baseUrl: parsed.data.baseUrl, apiKey };
    if (!ai.baseUrl?.trim()) return reply.status(400).send({ ok: false, models: [], message: "Missing baseUrl." });
    try {
      ai.baseUrl = normalizeOpenAiCompatBaseUrl(ai.baseUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid configuration.";
      return reply.status(400).send({ ok: false, models: [], message });
    }

    try {
      const p = createProvider(ai, { logger: req.log });
      const models = (await p.listModels?.()) ?? [];
      return reply.send({ ok: true, models });
    } catch (err) {
      const mapped = mapError(err);
      return reply.status(mapped.statusCode).send({ ok: false, models: [], message: mapped.message });
    }
  });

  app.get("/api/ai/workspaces", async (req, reply) => {
    const parsed = z
      .object({
        providerType: ProviderSchema.default("MOCK"),
        baseUrl: z.string().optional()
      })
      .safeParse(req.query);

    if (!parsed.success) return reply.status(400).send({ ok: false, error: "Invalid query" });

    const providerType = parsed.data.providerType as ProviderId;
    if (providerType !== "ANYTHINGLLM_DEV_API") {
      return reply.status(400).send({ ok: false, workspaces: [], message: "Workspaces only apply to AnythingLLM." });
    }

    const apiKey = apiKeyFromHeaders(req.headers as Record<string, unknown>);
    const ai: AiConfig = { providerType, baseUrl: parsed.data.baseUrl, apiKey };
    if (!ai.baseUrl?.trim()) return reply.status(400).send({ ok: false, workspaces: [], message: "Missing baseUrl." });
    if (!ai.apiKey?.trim()) return reply.status(400).send({ ok: false, workspaces: [], message: "Missing API key." });
    try {
      ai.baseUrl = normalizeAnythingLlmBaseUrl(ai.baseUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid configuration.";
      return reply.status(400).send({ ok: false, workspaces: [], message });
    }

    try {
      const p = createProvider(ai, { logger: req.log });
      const workspaces = (await p.listWorkspaces?.()) ?? [];
      return reply.send({ ok: true, workspaces });
    } catch (err) {
      const mapped = mapError(err);
      const message =
        err instanceof AiHttpError && err.status === 404
          ? "No se pudo listar workspaces. Ingresa workspaceSlug manualmente."
          : mapped.message;
      return reply.status(mapped.statusCode).send({ ok: false, workspaces: [], message });
    }
  });
}
