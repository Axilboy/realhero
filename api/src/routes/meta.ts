import type { FastifyPluginAsync } from "fastify";
import { readApiVersion } from "../lib/readApiVersion.js";

/**
 * Метаданные API: одна точка для веба, Telegram и нативных клиентов.
 * См. также GET /api/v1/openapi.json.
 */
export const metaRoutes: FastifyPluginAsync = async (app) => {
  app.get("/meta", async () => {
    const v = process.env.RELAXED_AUTH?.toLowerCase();
    const guestLogin = v === "1" || v === "true" || v === "yes";
    return {
      name: "real-hero-api",
      version: readApiVersion(),
      apiPrefix: "/api/v1",
      clients: ["web", "telegram_mini_app", "android", "ios"],
      guestLogin,
    };
  });
};
