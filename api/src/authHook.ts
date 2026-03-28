import type { FastifyReply, FastifyRequest } from "fastify";

const SESSION_COOKIE = "rh_session";

export async function authPreHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    // Сначала cookie (если есть), иначе Bearer — чтобы старый токен в SPA не перебивал живую cookie.
    // extractToken есть в рантайме @fastify/jwt, в типах verify запроса — нет.
    await request.jwtVerify({
      verify: {
        extractToken: (req: FastifyRequest) => {
          const fromCookie = req.cookies?.[SESSION_COOKIE];
          if (fromCookie) return fromCookie;
          const auth = req.headers.authorization;
          if (auth && /^Bearer\s/i.test(auth)) {
            const parts = auth.split(/\s+/);
            if (parts.length === 2 && parts[1]) return parts[1];
          }
          return undefined;
        },
      },
    } as Parameters<FastifyRequest["jwtVerify"]>[0]);
  } catch {
    return reply
      .status(401)
      .send({ error: { message: "Требуется вход" } });
  }
}

export function getUserId(request: FastifyRequest): string {
  return (request.user as { sub: string }).sub;
}
