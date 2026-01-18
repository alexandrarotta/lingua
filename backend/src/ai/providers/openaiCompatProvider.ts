import { buildOpenAiChatCompletionsUrl, buildOpenAiModelsUrl } from "../openaiUrls.js";
import { AiHttpError } from "../errors.js";
import type { AiConfig, ChatMessage } from "../types.js";
import type { AiProvider } from "./provider.js";

type OpenAiChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
};

type OpenAiChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

type OpenAiModelsResponse = {
  data?: Array<{ id?: string }>;
};

async function safeErrorCode(res: Response): Promise<string | null> {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) return null;
  try {
    const json = (await res.json()) as { error?: { code?: unknown; type?: unknown } };
    const code = json?.error?.code;
    const type = json?.error?.type;
    const v = typeof code === "string" ? code : typeof type === "string" ? type : null;
    return v?.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function authHeaders(apiKey?: string) {
  const key = apiKey?.trim();
  if (!key) return {};
  return { authorization: `Bearer ${key}` };
}

export function createOpenAiCompatProvider(
  config: AiConfig,
  opts?: { logger?: { info?: (obj: unknown, msg?: string) => void; debug?: (obj: unknown, msg?: string) => void } }
): AiProvider {
  const baseUrl = config.baseUrl?.trim();

  if (!baseUrl) {
    throw new Error("Missing baseUrl for OpenAI-compatible provider.");
  }

  const chatUrl = buildOpenAiChatCompletionsUrl(baseUrl);
  const modelsUrl = buildOpenAiModelsUrl(baseUrl);

  return {
    id: "LM_STUDIO_OPENAI_COMPAT",
    async chatCompletion({ model, messages, temperature }) {
      const m = model?.trim();
      if (!m) throw new Error("Missing model for OpenAI-compatible provider.");

      const body: OpenAiChatCompletionRequest = {
        model: m,
        messages,
        temperature,
        max_tokens: 450
      };

      const start = Date.now();
      const res = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(config.apiKey)
        },
        body: JSON.stringify(body)
      });
      const ms = Date.now() - start;
      opts?.logger?.info?.({ providerType: this.id, finalUrl: chatUrl, method: "POST", status: res.status, ms }, "AI proxy");

      if (!res.ok) {
        const code = await safeErrorCode(res);
        throw new AiHttpError("OpenAI-compatible chat failed.", { status: res.status, code: code ?? undefined });
      }

      const json = (await res.json()) as OpenAiChatCompletionResponse;
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error("OpenAI-compatible chat returned empty content.");
      return { content };
    },
    async listModels() {
      const start = Date.now();
      const res = await fetch(modelsUrl, {
        method: "GET",
        headers: { ...authHeaders(config.apiKey) }
      });
      const ms = Date.now() - start;
      opts?.logger?.info?.({ providerType: this.id, finalUrl: modelsUrl, method: "GET", status: res.status, ms }, "AI proxy");
      if (!res.ok) {
        const code = await safeErrorCode(res);
        throw new AiHttpError("OpenAI-compatible models failed.", { status: res.status, code: code ?? undefined });
      }
      const json = (await res.json()) as OpenAiModelsResponse;
      const ids = (json.data ?? []).map((m) => m.id).filter((x): x is string => !!x);
      return ids;
    },
    async testConnection() {
      const configured = config.model?.trim();
      const model = configured || (await this.listModels?.())?.[0];
      if (!model) return { ok: false, message: "Missing model. Use “Listar modelos” or type a model id, then test again." };

      await this.chatCompletion({ model, messages: [{ role: "user", content: "Reply with exactly: ok" }], temperature: 0 });
      return { ok: true, message: "Connected (chat completions ok)." };
    }
  };
}
