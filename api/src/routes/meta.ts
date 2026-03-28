import type { FastifyPluginAsync } from "fastify";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readApiVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "../../package.json"), "utf-8")
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Метаданные API: одна точка для веба, Telegram и нативных клиентов.
 * Дальше: /api/v1/openapi.json при появлении спецификации.
 */
export const metaRoutes: FastifyPluginAsync = async (app) => {
  app.get("/meta", async () => ({
    name: "real-hero-api",
    version: readApiVersion(),
    apiPrefix: "/api/v1",
    clients: ["web", "telegram_mini_app", "android", "ios"],
  }));
};
