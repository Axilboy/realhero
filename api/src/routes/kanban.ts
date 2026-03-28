import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";

const COLS = new Set(["todo", "doing", "done"]);
const TITLE_MIN = 1;
const TITLE_MAX = 200;

export const kanbanRoutes: FastifyPluginAsync = async (app) => {
  app.get("/kanban/cards", async (request, reply) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const userId = request.user.sub;
    const cards = await prisma.kanbanCard.findMany({
      where: { userId },
      orderBy: [{ column: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        column: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { cards };
  });

  app.post("/kanban/cards", async (request, reply) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const userId = request.user.sub;
    const body = request.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== "object") {
      return reply.status(400).send({ error: "invalid_body" });
    }
    if (typeof body.title !== "string") return reply.status(400).send({ error: "invalid_title" });
    const title = body.title.trim();
    if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
      return reply.status(400).send({ error: "invalid_title" });
    }
    let column = "todo";
    if (body.column !== undefined) {
      if (typeof body.column !== "string" || !COLS.has(body.column)) {
        return reply.status(400).send({ error: "invalid_column" });
      }
      column = body.column;
    }
    const maxOrder = await prisma.kanbanCard.aggregate({
      where: { userId, column },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;

    const card = await prisma.kanbanCard.create({
      data: { userId, title, column, sortOrder },
      select: {
        id: true,
        title: true,
        column: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return reply.status(201).send({ card });
  });

  app.patch<{ Params: { id: string } }>("/kanban/cards/:id", async (request, reply) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const userId = request.user.sub;
    const { id } = request.params;
    const body = request.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== "object") {
      return reply.status(400).send({ error: "invalid_body" });
    }

    const card = await prisma.kanbanCard.findFirst({ where: { id, userId } });
    if (!card) return reply.status(404).send({ error: "not_found" });

    const data: { title?: string; column?: string; sortOrder?: number } = {};

    if ("title" in body) {
      if (typeof body.title !== "string") return reply.status(400).send({ error: "invalid_title" });
      const t = body.title.trim();
      if (t.length < TITLE_MIN || t.length > TITLE_MAX) return reply.status(400).send({ error: "invalid_title" });
      data.title = t;
    }
    if ("column" in body) {
      if (typeof body.column !== "string" || !COLS.has(body.column)) {
        return reply.status(400).send({ error: "invalid_column" });
      }
      data.column = body.column;
    }
    if ("sortOrder" in body) {
      if (typeof body.sortOrder !== "number" || !Number.isInteger(body.sortOrder)) {
        return reply.status(400).send({ error: "invalid_sort" });
      }
      data.sortOrder = body.sortOrder;
    }

    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: "no_fields" });
    }

    let sortOrder = data.sortOrder;
    if (data.column && data.column !== card.column && data.sortOrder === undefined) {
      const maxOrder = await prisma.kanbanCard.aggregate({
        where: { userId, column: data.column },
        _max: { sortOrder: true },
      });
      sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;
    }

    const updated = await prisma.kanbanCard.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.column !== undefined ? { column: data.column } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
      },
      select: {
        id: true,
        title: true,
        column: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { card: updated };
  });

  app.delete<{ Params: { id: string } }>("/kanban/cards/:id", async (request, reply) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const userId = request.user.sub;
    const { id } = request.params;
    const c = await prisma.kanbanCard.findFirst({ where: { id, userId } });
    if (!c) return reply.status(404).send({ error: "not_found" });
    await prisma.kanbanCard.delete({ where: { id } });
    return { ok: true };
  });
};
