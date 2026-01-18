import type { ChatMessage } from "../types.js";
import type { AiProvider } from "./provider.js";

function basicCorrect(text: string) {
  let t = text.trim();
  if (!t) return t;
  t = t.replace(/\s+/g, " ");
  t = t.replace(/\bi\b/g, "I");
  t = t.replace(/\bim\b/gi, "I'm");
  t = t.replace(/\bdont\b/gi, "don't");
  t = t.replace(/\bcant\b/gi, "can't");
  t = t.replace(/\bwont\b/gi, "won't");
  t = t.replace(/\bive\b/gi, "I've");
  t = t.replace(/\bid\b/gi, "I'd");
  t = t[0]?.toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += ".";
  return t;
}

function mockReplyFrom(messages: ChatMessage[]) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const base = basicCorrect(lastUser);
  return `Got it. In a more natural way, you can say: “${base}” What do you want to talk about next?`;
}

export function createMockProvider(): AiProvider {
  return {
    id: "MOCK",
    async chatCompletion({ messages }) {
      return { content: mockReplyFrom(messages) };
    },
    async listModels() {
      return [];
    },
    async testConnection() {
      return { ok: true, message: "MOCK provider is always available." };
    }
  };
}
