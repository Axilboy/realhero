import type { FastifyRequest } from "fastify";

/**
 * Secure-флаг для Set-Cookie. Не привязываем к NODE_ENV: иначе при production на HTTP
 * (или за nginx без корректного X-Forwarded-Proto) браузер отбрасывает cookie — «вход не работает».
 */
export function useSecureSessionCookie(request: FastifyRequest): boolean {
  const o = process.env.SESSION_COOKIE_SECURE?.toLowerCase();
  if (o === "false" || o === "0") return false;
  if (o === "true" || o === "1") return true;
  return request.protocol === "https";
}

export function rhSessionCookieOptions(request: FastifyRequest) {
  return {
    path: "/",
    httpOnly: true,
    secure: useSecureSessionCookie(request),
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30,
  };
}
