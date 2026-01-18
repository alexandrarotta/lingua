import type { FastifyInstance } from "fastify";
import { CoachTurnRequestSchema, runCoachTurn } from "../coach/coachTurn.js";

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

export function registerCoachRoutes(app: FastifyInstance) {
  app.post("/api/coach/turn", async (req, reply) => {
    const parsed = CoachTurnRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: "Invalid request",
        issues: parsed.error.issues
      });
    }

    const apiKey = apiKeyFromHeaders(req.headers as Record<string, unknown>);
    const result = await runCoachTurn(parsed.data, { logger: req.log, apiKey });
    return reply.send(result);
  });
}
