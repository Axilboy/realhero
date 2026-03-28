import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import { rhSessionCookieOptions } from "../lib/cookieSecure.js";

const devAuthEnabled =
  process.env.NODE_ENV !== "production" && process.env.DEV_RELAXED_AUTH === "1";

function relaxedAuthEnabled(): boolean {
  const v = process.env.RELAXED_AUTH?.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export const authDevRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/dev-login", async (request, reply) => {
    if (!devAuthEnabled) {
      return reply.status(404).send({ error: "not_found" });
    }
    const email = process.env.DEV_AUTH_EMAIL ?? "dev@local.rh";
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, displayName: "Разработчик" },
      update: {},
    });
    const token = await reply.jwtSign({ sub: user.id });
    reply.setCookie("rh_session", token, rhSessionCookieOptions(request));
    return { ok: true };
  });

  /**
   * Вход без OAuth: один общий пользователь для всех (только если RELAXED_AUTH=1).
   * Для продакшена выключайте, если нужны отдельные аккаунты.
   */
  app.post("/auth/guest-login", async (request, reply) => {
    if (!relaxedAuthEnabled()) {
      return reply.status(404).send({ error: "not_found" });
    }
    const email = process.env.RELAXED_AUTH_EMAIL ?? "guest@local.rh";
    const displayName = process.env.RELAXED_AUTH_DISPLAY_NAME ?? "Гость";
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, displayName },
      update: {},
    });
    const token = await reply.jwtSign({ sub: user.id });
    reply.setCookie("rh_session", token, rhSessionCookieOptions(request));
    return { ok: true };
  });
};
