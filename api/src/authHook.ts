import type { FastifyReply, FastifyRequest } from "fastify";

export async function authPreHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    await request.jwtVerify({ onlyCookie: true });
  } catch {
    return reply
      .status(401)
      .send({ error: { message: "Требуется вход" } });
  }
}

export function getUserId(request: FastifyRequest): string {
  return (request.user as { sub: string }).sub;
}
