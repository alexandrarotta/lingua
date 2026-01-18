import { buildAnythingLlmChatUrl, buildAnythingLlmWorkspacesUrls, normalizeAnythingLlmBaseUrl } from "../anythingllmUrls.js";
import { AiHttpError } from "../errors.js";
import type { AiConfig, ChatMessage } from "../types.js";
import type { AiProvider } from "./provider.js";

type AnythingLlmChatMode = "chat" | "query";

type AnythingLlmChatRequest = {
  message: string;
  mode: AnythingLlmChatMode;
  sessionId?: string;
  reset?: boolean;
};

function authHeaders(apiKey?: string) {
  const key = apiKey?.trim();
  if (!key) return null;
  return { authorization: `Bearer ${key}` };
}

async function readJsonOrText(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.toLowerCase().includes("application/json")) {
    try {
      return (await res.json()) as unknown;
    } catch {
      // fall through
    }
  }
  try {
    return await res.text();
  } catch {
    return null;
  }
}

function extractAssistantText(payload: unknown): string | null {
  if (typeof payload === "string") {
    const t = payload.trim();
    return t ? t : null;
  }
  if (!payload || typeof payload !== "object") return null;

  const obj = payload as Record<string, unknown>;
  const directKeys = ["text", "response", "answer", "content", "message", "output"];
  for (const k of directKeys) {
    const v = obj[k];
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return t;
    }
  }

  const nestedKeys = ["data", "result", "payload", "chat"];
  for (const k of nestedKeys) {
    const v = obj[k];
    const t = extractAssistantText(v);
    if (t) return t;
  }

  return null;
}

function messagesToPrompt(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      const role = m.role.toUpperCase();
      return `${role}:\n${m.content}`;
    })
    .join("\n\n");
}

export function createAnythingLlmDevProvider(
  config: AiConfig,
  opts?: { logger?: { info?: (obj: unknown, msg?: string) => void; debug?: (obj: unknown, msg?: string) => void } }
): AiProvider {
  const rawBaseUrl = config.baseUrl?.trim();
  if (!rawBaseUrl) throw new Error("Missing baseUrl for AnythingLLM provider.");
  const baseUrl = normalizeAnythingLlmBaseUrl(rawBaseUrl);

  return {
    id: "ANYTHINGLLM_DEV_API",

    async chatCompletion({ messages, sessionId }) {
      const workspaceSlug = config.workspaceSlug?.trim();
      if (!workspaceSlug) throw new Error("Missing workspaceSlug for AnythingLLM provider.");

      const headers = authHeaders(config.apiKey);
      if (!headers) throw new Error("Missing API key for AnythingLLM provider.");

      const mode = (config.anythingllmMode?.trim() as AnythingLlmChatMode) || "chat";
      if (mode !== "chat" && mode !== "query") throw new Error('Invalid AnythingLLM mode. Use "chat" or "query".');

      const url = buildAnythingLlmChatUrl(baseUrl, workspaceSlug);
      const prompt = messagesToPrompt(messages);

      const body: AnythingLlmChatRequest = {
        message: prompt,
        mode,
        sessionId,
        reset: false
      };

      const start = Date.now();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers
        },
        body: JSON.stringify(body)
      });
      const ms = Date.now() - start;
      opts?.logger?.info?.({ providerType: this.id, finalUrl: url, method: "POST", status: res.status, ms }, "AI proxy");

      if (!res.ok) throw new AiHttpError("AnythingLLM chat failed.", { status: res.status });

      const payload = await readJsonOrText(res);
      const content = extractAssistantText(payload);
      if (!content) throw new Error("AnythingLLM chat returned empty content.");
      return { content };
    },

    async listWorkspaces() {
      const headers = authHeaders(config.apiKey);
      if (!headers) throw new Error("Missing API key for AnythingLLM provider.");

      const urls = buildAnythingLlmWorkspacesUrls(baseUrl);

      let lastErr: AiHttpError | null = null;
      for (const url of urls) {
        const start = Date.now();
        const res = await fetch(url, { method: "GET", headers });
        const ms = Date.now() - start;
        opts?.logger?.info?.({ providerType: this.id, finalUrl: url, method: "GET", status: res.status, ms }, "AI proxy");

        if (!res.ok) {
          lastErr = new AiHttpError("AnythingLLM workspaces failed.", { status: res.status });
          continue;
        }

        const payload = await readJsonOrText(res);
        const slugs = extractWorkspaceSlugs(payload);
        return slugs;
      }

      throw lastErr ?? new AiHttpError("AnythingLLM workspaces failed.", { status: 502 });
    },

    async testConnection() {
      // Required for AnythingLLM: baseUrl + apiKey + workspaceSlug
      const workspaceSlug = config.workspaceSlug?.trim();
      if (!workspaceSlug) return { ok: false, message: "Missing workspaceSlug for AnythingLLM." };
      const apiKey = config.apiKey?.trim();
      if (!apiKey) return { ok: false, message: "Missing API key for AnythingLLM." };

      await this.chatCompletion({
        messages: [{ role: "user", content: "Reply with exactly: ok" }],
        sessionId: "lingua-test"
      });

      return { ok: true, message: "Connected (AnythingLLM chat ok)." };
    }
  };
}

function extractWorkspaceSlugs(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;

  const arrays: unknown[] = [];
  if (Array.isArray(obj.workspaces)) arrays.push(...obj.workspaces);
  if (Array.isArray(obj.data)) arrays.push(...obj.data);
  if (Array.isArray(obj.results)) arrays.push(...obj.results);

  const slugs: string[] = [];
  for (const item of arrays) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const slug = typeof it.slug === "string" ? it.slug : typeof it.workspaceSlug === "string" ? it.workspaceSlug : null;
    const name = typeof it.name === "string" ? it.name : null;
    const id = typeof it.id === "string" ? it.id : null;
    const v = (slug ?? name ?? id)?.trim();
    if (v) slugs.push(v);
  }

  return Array.from(new Set(slugs));
}

