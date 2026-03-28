import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { healthRoutes } from "./routes/health.js";
import { metaRoutes } from "./routes/meta.js";

const PORT = Number(process.env.PORT) || 3000;
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((s: string) => s.trim())
  .filter(Boolean);

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: CORS_ORIGINS,
    credentials: true,
  });

  await app.register(healthRoutes);
  await app.register(metaRoutes, { prefix: "/api/v1" });

  await app.listen({ port: PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
