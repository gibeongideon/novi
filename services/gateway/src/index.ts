import Fastify from "fastify";

export function buildServer() {
  const app = Fastify({ logger: true });
  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async () => ({ status: "ready" }));
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 4000);
  buildServer()
    .listen({ port, host: "0.0.0.0" })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
