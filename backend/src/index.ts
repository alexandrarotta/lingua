import { buildApp } from "./server/app.js";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";

const app = await buildApp();

try {
  await app.listen({ host, port });
  const url = `http://${host}:${port}`;
  app.log.info(`Server listening on ${url}`);
} catch (err) {
  if (app.log?.error) app.log.error(err);
  else console.error(err);
  process.exit(1);
}
