import type { FastifyPluginAsync } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  settings: true,
  createdAt: true,
} as const;

function mergeSettings(
  existing: unknown,
  patch: Record<string, unknown>
): Prisma.InputJsonValue {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return { ...base, ...patch } as Prisma.InputJsonValue;
}

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
      select: userSelect,
    });
    if (!user) {
      reply.clearCookie("rh_session", { path: "/" });
      return reply.status(401).send({ error: "unauthorized" });
    }
    return { user };
  });

  app.patch("/me", async (request, reply) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const sub = request.user.sub;
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return reply.status(400).send({ error: "invalid_body" });
    }
    const raw = body as Record<string, unknown>;
    const data: Prisma.UserUpdateInput = {};

    if ("displayName" in raw) {
      const v = raw.displayName;
      if (v === null) {
        data.displayName = null;
      } else if (typeof v === "string") {
        const t = v.trim();
        if (t.length > 120) {
          return reply.status(400).send({ error: "display_name_too_long" });
        }
        data.displayName = t || null;
      } else {
        return reply.status(400).send({ error: "invalid_display_name" });
      }
    }

    if ("settings" in raw) {
      const s = raw.settings;
      if (s === null) {
        data.settings = Prisma.JsonNull;
      } else if (s === undefined) {
        /* skip */
      } else if (typeof s === "object" && !Array.isArray(s)) {
        const current = await prisma.user.findUnique({
          where: { id: sub },
          select: { settings: true },
        });
        data.settings = mergeSettings(current?.settings, s as Record<string, unknown>);
      } else {
        return reply.status(400).send({ error: "invalid_settings" });
      }
    }

    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: "no_fields" });
    }

    try {
      const user = await prisma.user.update({
        where: { id: sub },
        data,
        select: userSelect,
      });
      return { user };
    } catch {
      reply.clearCookie("rh_session", { path: "/" });
      return reply.status(401).send({ error: "unauthorized" });
    }
  });
};
