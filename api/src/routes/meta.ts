import type { FastifyPluginAsync } from "fastify";
import { readApiVersion } from "../lib/readApiVersion.js";

/**
 * Метаданные API: одна точка для веба, Telegram и нативных клиентов.
 * См. также GET /api/v1/openapi.json.
 */
export const metaRoutes: FastifyPluginAsync = async (app) => {
  app.get("/meta", async () => ({
    name: "real-hero-api",
    version: readApiVersion(),
    apiPrefix: "/api/v1",
    clients: ["web", "telegram_mini_app", "android", "ios"],
  }));
};
