import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import {
  Google,
  Yandex,
  VK,
  generateCodeVerifier,
  generateState,
} from "arctic";
import type { OAuth2Tokens } from "arctic";
import {
  OAUTH_COOKIE_NAME,
  OAUTH_COOKIE_MAX_AGE,
  decodeOAuthCookie,
  encodeOAuthCookie,
} from "../lib/oauthCookie.js";
import { findOrCreateUserFromOAuth } from "../lib/oauthUser.js";
import { useSecureSessionCookie } from "../lib/cookieSecure.js";

function oauthStateCookieOpts(request: FastifyRequest) {
  const secure = useSecureSessionCookie(request);
  return {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    maxAge: OAUTH_COOKIE_MAX_AGE,
  };
}

function sessionCookieOpts(request: FastifyRequest) {
  const secure = useSecureSessionCookie(request);
  return {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30,
  };
}

function frontendRedirect(reply: FastifyReply, search: Record<string, string>) {
  const base = process.env.FRONTEND_URL ?? "http://localhost:5173";
  const u = new URL("/login", base);
  for (const [k, v] of Object.entries(search)) u.searchParams.set(k, v);
  return reply.redirect(u.toString());
}

function jwtSecret(): string {
  return process.env.JWT_SECRET ?? "insecure-dev-only-change-me";
}

async function googleProfile(accessToken: string) {
  const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error("google_userinfo_failed");
  const j = (await r.json()) as { sub: string; email?: string; name?: string };
  return {
    providerAccountId: j.sub,
    email: j.email ?? null,
    displayName: j.name ?? null,
  };
}

async function yandexProfile(accessToken: string) {
  const r = await fetch("https://login.yandex.ru/info?format=json", {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  if (!r.ok) throw new Error("yandex_info_failed");
  const j = (await r.json()) as {
    id: string;
    default_email?: string;
    login?: string;
    display_name?: string;
    real_name?: string;
  };
  return {
    providerAccountId: j.id,
    email: j.default_email ?? null,
    displayName: j.display_name ?? j.real_name ?? j.login ?? null,
  };
}

function vkTokenExtras(tokens: OAuth2Tokens): { userId: string; email: string | null } {
  const d = tokens.data as Record<string, unknown>;
  const uid = d.user_id;
  const userId =
    typeof uid === "number" ? String(uid) : typeof uid === "string" ? uid : null;
  if (!userId) throw new Error("vk_no_user_id");
  const email = typeof d.email === "string" ? d.email : null;
  return { userId, email };
}

async function vkDisplayName(accessToken: string, userId: string): Promise<string | null> {
  const u = new URL("https://api.vk.com/method/users.get");
  u.searchParams.set("user_ids", userId);
  u.searchParams.set("v", "5.131");
  u.searchParams.set("access_token", accessToken);
  u.searchParams.set("lang", "0");
  const r = await fetch(u);
  if (!r.ok) return null;
  const j = (await r.json()) as {
    response?: { id: number; first_name?: string; last_name?: string }[];
  };
  const row = j.response?.[0];
  if (!row) return null;
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || null;
}

export const oauthRoutes: FastifyPluginAsync = async (app) => {
  const secret = jwtSecret();

  /** ---------- Google ---------- */
  app.get("/auth/google", async (request: FastifyRequest, reply) => {
    const id = process.env.GOOGLE_CLIENT_ID;
    const cs = process.env.GOOGLE_CLIENT_SECRET;
    const redirect = process.env.GOOGLE_REDIRECT_URI;
    if (!id || !cs || !redirect) {
      return frontendRedirect(reply, { error: "google_not_configured" });
    }
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const payload = encodeOAuthCookie(
      { state, codeVerifier, provider: "google" },
      secret
    );
    reply.setCookie(OAUTH_COOKIE_NAME, payload, oauthStateCookieOpts(request));
    const google = new Google(id, cs, redirect);
    const url = google.createAuthorizationURL(state, codeVerifier, [
      "openid",
      "email",
      "profile",
    ]);
    return reply.redirect(url.toString());
  });

  app.get("/auth/google/callback", async (request, reply) => {
    const id = process.env.GOOGLE_CLIENT_ID;
    const cs = process.env.GOOGLE_CLIENT_SECRET;
    const redirect = process.env.GOOGLE_REDIRECT_URI;
    const q = request.query as { code?: string; state?: string; error?: string };
    if (q.error) return frontendRedirect(reply, { error: "google_denied" });
    if (!id || !cs || !redirect || !q.code || !q.state) {
      return frontendRedirect(reply, { error: "google_bad_request" });
    }
    const raw = decodeOAuthCookie(request.cookies[OAUTH_COOKIE_NAME], secret);
    reply.clearCookie(OAUTH_COOKIE_NAME, { path: "/" });
    if (!raw || raw.provider !== "google" || raw.state !== q.state || !raw.codeVerifier) {
      return frontendRedirect(reply, { error: "google_state" });
    }
    try {
      const google = new Google(id, cs, redirect);
      const tokens = await google.validateAuthorizationCode(q.code, raw.codeVerifier);
      const p = await googleProfile(tokens.accessToken());
      const user = await findOrCreateUserFromOAuth({
        provider: "google",
        providerAccountId: p.providerAccountId,
        email: p.email,
        displayName: p.displayName,
      });
      const token = await reply.jwtSign({ sub: user.id });
      reply.setCookie("rh_session", token, sessionCookieOpts(request));
      return reply.redirect((process.env.FRONTEND_URL ?? "http://localhost:5173") + "/");
    } catch (e) {
      app.log.error(e);
      return frontendRedirect(reply, { error: "google_failed" });
    }
  });

  /** ---------- Yandex ---------- */
  app.get("/auth/yandex", async (request, reply) => {
    const id = process.env.YANDEX_CLIENT_ID;
    const cs = process.env.YANDEX_CLIENT_SECRET;
    const redirect = process.env.YANDEX_REDIRECT_URI;
    if (!id || !cs || !redirect) {
      return frontendRedirect(reply, { error: "yandex_not_configured" });
    }
    const state = generateState();
    const payload = encodeOAuthCookie({ state, provider: "yandex" }, secret);
    reply.setCookie(OAUTH_COOKIE_NAME, payload, oauthStateCookieOpts(request));
    const yandex = new Yandex(id, cs, redirect);
    const url = yandex.createAuthorizationURL(state, ["login:email", "login:info"]);
    return reply.redirect(url.toString());
  });

  app.get("/auth/yandex/callback", async (request, reply) => {
    const id = process.env.YANDEX_CLIENT_ID;
    const cs = process.env.YANDEX_CLIENT_SECRET;
    const redirect = process.env.YANDEX_REDIRECT_URI;
    const q = request.query as { code?: string; state?: string; error?: string };
    if (q.error) return frontendRedirect(reply, { error: "yandex_denied" });
    if (!id || !cs || !redirect || !q.code || !q.state) {
      return frontendRedirect(reply, { error: "yandex_bad_request" });
    }
    const raw = decodeOAuthCookie(request.cookies[OAUTH_COOKIE_NAME], secret);
    reply.clearCookie(OAUTH_COOKIE_NAME, { path: "/" });
    if (!raw || raw.provider !== "yandex" || raw.state !== q.state) {
      return frontendRedirect(reply, { error: "yandex_state" });
    }
    try {
      const yandex = new Yandex(id, cs, redirect);
      const tokens = await yandex.validateAuthorizationCode(q.code);
      const p = await yandexProfile(tokens.accessToken());
      const user = await findOrCreateUserFromOAuth({
        provider: "yandex",
        providerAccountId: p.providerAccountId,
        email: p.email,
        displayName: p.displayName,
      });
      const token = await reply.jwtSign({ sub: user.id });
      reply.setCookie("rh_session", token, sessionCookieOpts(request));
      return reply.redirect((process.env.FRONTEND_URL ?? "http://localhost:5173") + "/");
    } catch (e) {
      app.log.error(e);
      return frontendRedirect(reply, { error: "yandex_failed" });
    }
  });

  /** ---------- VK ---------- */
  app.get("/auth/vk", async (request, reply) => {
    const id = process.env.VK_CLIENT_ID;
    const cs = process.env.VK_CLIENT_SECRET;
    const redirect = process.env.VK_REDIRECT_URI;
    if (!id || !cs || !redirect) {
      return frontendRedirect(reply, { error: "vk_not_configured" });
    }
    const state = generateState();
    const payload = encodeOAuthCookie({ state, provider: "vk" }, secret);
    reply.setCookie(OAUTH_COOKIE_NAME, payload, oauthStateCookieOpts(request));
    const vk = new VK(id, cs, redirect);
    const url = vk.createAuthorizationURL(state, ["email"]);
    return reply.redirect(url.toString());
  });

  app.get("/auth/vk/callback", async (request, reply) => {
    const id = process.env.VK_CLIENT_ID;
    const cs = process.env.VK_CLIENT_SECRET;
    const redirect = process.env.VK_REDIRECT_URI;
    const q = request.query as { code?: string; state?: string; error?: string };
    if (q.error) return frontendRedirect(reply, { error: "vk_denied" });
    if (!id || !cs || !redirect || !q.code || !q.state) {
      return frontendRedirect(reply, { error: "vk_bad_request" });
    }
    const raw = decodeOAuthCookie(request.cookies[OAUTH_COOKIE_NAME], secret);
    reply.clearCookie(OAUTH_COOKIE_NAME, { path: "/" });
    if (!raw || raw.provider !== "vk" || raw.state !== q.state) {
      return frontendRedirect(reply, { error: "vk_state" });
    }
    try {
      const vk = new VK(id, cs, redirect);
      const tokens = await vk.validateAuthorizationCode(q.code);
      const { userId, email } = vkTokenExtras(tokens);
      const displayName = await vkDisplayName(tokens.accessToken(), userId);
      const user = await findOrCreateUserFromOAuth({
        provider: "vk",
        providerAccountId: userId,
        email,
        displayName,
      });
      const token = await reply.jwtSign({ sub: user.id });
      reply.setCookie("rh_session", token, sessionCookieOpts(request));
      return reply.redirect((process.env.FRONTEND_URL ?? "http://localhost:5173") + "/");
    } catch (e) {
      app.log.error(e);
      return frontendRedirect(reply, { error: "vk_failed" });
    }
  });
};
