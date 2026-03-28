import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { findOrCreateUserFromOAuth } from "../lib/oauthUser.js";
import { rhSessionCookieOptions } from "../lib/cookieSecure.js";
import { verifyTelegramLoginPayload } from "../lib/verifyTelegramAuth.js";

let cachedBotUsername: string | null | undefined;

function frontendRedirect(reply: FastifyReply, search: Record<string, string>) {
  const base = process.env.FRONTEND_URL ?? "http://localhost:5173";
  const u = new URL("/login", base);
  for (const [k, v] of Object.entries(search)) u.searchParams.set(k, v);
  return reply.redirect(u.toString());
}

function frontendHome(reply: FastifyReply) {
  const base = process.env.FRONTEND_URL ?? "http://localhost:5173";
  return reply.redirect(new URL("/", base).toString());
}

function flattenQuery(q: FastifyRequest["query"]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!q || typeof q !== "object") return out;
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null) continue;
    out[k] = Array.isArray(v) ? String(v[0]) : String(v);
  }
  return out;
}

async function resolveTelegramBotUsername(): Promise<string | null> {
  const fromEnv = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim();
  if (fromEnv) return fromEnv;
  if (cachedBotUsername !== undefined) return cachedBotUsername;
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    cachedBotUsername = null;
    return null;
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const j = (await r.json()) as { ok?: boolean; result?: { username?: string } };
    cachedBotUsername = j.ok && j.result?.username ? j.result.username : null;
  } catch {
    cachedBotUsername = null;
  }
  return cachedBotUsername;
}

export const telegramAuthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/auth/telegram/widget-info", async (_request, reply) => {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) {
      return reply.send({ botUsername: null as string | null });
    }
    const botUsername = await resolveTelegramBotUsername();
    return reply.send({ botUsername });
  });

  /**
   * Callback виджета Telegram: редирект с query id, first_name, …, hash.
   */
  app.get("/auth/telegram", async (request, reply) => {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) {
      return frontendRedirect(reply, { error: "telegram_not_configured" });
    }

    const flat = flattenQuery(request.query);
    if (!flat.hash || !flat.id) {
      return frontendRedirect(reply, { error: "telegram_bad_request" });
    }

    if (!verifyTelegramLoginPayload(flat, token)) {
      return frontendRedirect(reply, { error: "telegram_invalid" });
    }

    const first = flat.first_name ?? "";
    const last = flat.last_name ?? "";
    const displayName =
      [first, last].filter(Boolean).join(" ").trim() ||
      (flat.username ? `@${flat.username}` : null);

    try {
      const user = await findOrCreateUserFromOAuth({
        provider: "telegram",
        providerAccountId: flat.id,
        email: null,
        displayName,
      });
      const jwt = await reply.jwtSign({ sub: user.id });
      reply.setCookie("rh_session", jwt, rhSessionCookieOptions(request));
      return frontendHome(reply);
    } catch (e) {
      app.log.error(e);
      return frontendRedirect(reply, { error: "telegram_failed" });
    }
  });
};
