import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server/app.js";

describe("backend endpoints", () => {
  it("GET /api/health", async () => {
    const app = await buildApp({ logger: false, dbPath: ":memory:" });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });

  it("POST /api/coach/turn returns coaching payload", async () => {
    const app = await buildApp({ logger: false, dbPath: ":memory:" });
    const res = await app.inject({
      method: "POST",
      url: "/api/coach/turn",
      payload: { transcriptText: "i like pizza", ai: { providerType: "MOCK" } }
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.ok).toBe(true);
    expect(json.correctedUserText).toContain("I");
    expect(Array.isArray(json.pronunciationTokens)).toBe(true);
  });

  it("GET /api/ai/models (mock) returns empty list", async () => {
    const app = await buildApp({ logger: false, dbPath: ":memory:" });
    const res = await app.inject({ method: "GET", url: "/api/ai/models?providerType=MOCK" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, models: [] });
  });

  it("GET /api/ai/models rejects AnythingLLM providerType", async () => {
    const app = await buildApp({ logger: false, dbPath: ":memory:" });
    const res = await app.inject({
      method: "GET",
      url: "/api/ai/models?providerType=ANYTHINGLLM_DEV_API"
    });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.ok).toBe(false);
  });

  it("GET /api/ai/workspaces requires API key", async () => {
    const app = await buildApp({ logger: false, dbPath: ":memory:" });
    const res = await app.inject({
      method: "GET",
      url: "/api/ai/workspaces?providerType=ANYTHINGLLM_DEV_API&baseUrl=http://localhost:3001"
    });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.ok).toBe(false);
  });

  it("POST /api/ai/test rejects mixed baseUrl (/responses) for OpenAI-compatible", async () => {
    const app = await buildApp({ logger: false, dbPath: ":memory:" });
    const res = await app.inject({
      method: "POST",
      url: "/api/ai/test",
      payload: {
        ai: {
          providerType: "LM_STUDIO_OPENAI_COMPAT",
          baseUrl: "http://localhost:1234/v1/responses",
          model: "any"
        }
      }
    });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.ok).toBe(false);
  });
});
