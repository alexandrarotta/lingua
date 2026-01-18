export type AiProviderType = "LM_STUDIO_OPENAI_COMPAT" | "ANYTHINGLLM_DEV_API";
export type AnythingLlmMode = "chat" | "query";

export type AiProfile = {
  id: string;
  name: string;
  providerType: AiProviderType;
  baseUrl: string;
  model: string;
  workspaceSlug: string;
  anythingllmMode: AnythingLlmMode;
  createdAt: number;
  updatedAt: number;
};

export const DEFAULT_LOCAL_PROFILE_ID = "local-lm-studio";
export const DEFAULT_OPENAI_PROFILE_ID = "openai-cloud";
export const DEFAULT_ANYTHINGLLM_PROFILE_ID = "anythingllm";

export function isAnythingLlmProfile(profile: Pick<AiProfile, "providerType">) {
  return profile.providerType === "ANYTHINGLLM_DEV_API";
}
