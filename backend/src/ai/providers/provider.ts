import type { ChatMessage, ProviderId } from "../types.js";

export type ChatCompletionResult = {
  content: string;
};

export interface AiProvider {
  id: ProviderId;
  chatCompletion(input: {
    model?: string;
    messages: ChatMessage[];
    temperature?: number;
    sessionId?: string;
  }): Promise<ChatCompletionResult>;
  listModels?(): Promise<string[]>;
  listWorkspaces?(): Promise<string[]>;
  testConnection?(): Promise<{ ok: boolean; message: string }>;
}
