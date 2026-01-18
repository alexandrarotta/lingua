import type { AiConfig } from "./types.js";
import { createMockProvider } from "./providers/mockProvider.js";
import { createOpenAiCompatProvider } from "./providers/openaiCompatProvider.js";
import { createAnythingLlmDevProvider } from "./providers/anythingllmDevProvider.js";
import type { AiProvider } from "./providers/provider.js";

export function createProvider(
  config: AiConfig,
  opts?: { logger?: { info?: (obj: unknown, msg?: string) => void; debug?: (obj: unknown, msg?: string) => void } }
): AiProvider {
  if (config.providerType === "LM_STUDIO_OPENAI_COMPAT") return createOpenAiCompatProvider(config, opts);
  if (config.providerType === "ANYTHINGLLM_DEV_API") return createAnythingLlmDevProvider(config, opts);
  return createMockProvider();
}
