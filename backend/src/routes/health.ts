import type { FastifyInstance } from "fastify";

export function registerHealthRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => {
    return { ok: true, service: "lingua-backend", time: new Date().toISOString() };
  });
}

