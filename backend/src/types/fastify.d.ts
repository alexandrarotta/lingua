import "fastify";
import type { LinguaDb } from "../db/db.js";
import type { AuthJwtPayload } from "../auth/jwt.js";
import type { AuthUser } from "../auth/middleware.js";

declare module "fastify" {
  interface FastifyInstance {
    db: LinguaDb;
  }

  interface FastifyRequest {
    user?: AuthJwtPayload;
    authUser?: AuthUser;
  }
}
