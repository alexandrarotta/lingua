export type ProviderId = "MOCK" | "LM_STUDIO_OPENAI_COMPAT" | "ANYTHINGLLM_DEV_API";
export type AnythingLlmMode = "chat" | "query";

export type AiConfig = {
  providerType: ProviderId;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  workspaceSlug?: string;
  anythingllmMode?: AnythingLlmMode;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
