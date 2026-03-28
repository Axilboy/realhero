import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";

export const sessionRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/logout", async (_request, reply) => {
    reply.clearCookie("rh_session", { path: "/" });
    return { ok: true };
  });

  app.get("/me", async (request, reply) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const sub = request.user.sub;
    const user = await prisma.user.findUnique({
      where: { id: sub },
      select: { id: true, email: true, displayName: true, createdAt: true },
    });
    if (!user) {
      reply.clearCookie("rh_session", { path: "/" });
      return reply.status(401).send({ error: "unauthorized" });
    }
    return { user };
  });
};
