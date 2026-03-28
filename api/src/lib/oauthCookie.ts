import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const COOKIE = "rh_oauth";
const MAX_AGE_SEC = 600;

export type OAuthCookiePayload = {
  state: string;
  codeVerifier?: string;
  provider: "google" | "yandex" | "vk";
};

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function encodeOAuthCookie(payload: OAuthCookiePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const sig = sign(body, secret);
  return `${body}.${sig}`;
}

export function decodeOAuthCookie(
  value: string | undefined,
  secret: string
): OAuthCookiePayload | null {
  if (!value) return null;
  const i = value.lastIndexOf(".");
  if (i <= 0) return null;
  const body = value.slice(0, i);
  const sig = value.slice(i + 1);
  const expected = sign(body, secret);
  try {
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as OAuthCookiePayload;
  } catch {
    return null;
  }
}

export function randomState(): string {
  return randomBytes(24).toString("base64url");
}

export { COOKIE as OAUTH_COOKIE_NAME, MAX_AGE_SEC as OAUTH_COOKIE_MAX_AGE };
