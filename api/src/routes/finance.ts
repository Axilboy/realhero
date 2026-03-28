import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";

const CAT_MAX = 48;
const NOTE_MAX = 500;
const AMOUNT_MAX = 1_000_000_000;

function parseDateStart(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export const financeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/finance/transactions", async (request, reply) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const userId = request.user.sub;
    const q = request.query as { from?: string; to?: string; limit?: string };
    const from = parseDateStart(q.from);
    const to = parseDateStart(q.to);
    const limit = Math.min(200, Math.max(1, parseInt(q.limit ?? "80", 10) || 80));

    const where: { userId: string; occurredAt?: { gte?: Date; lte?: Date } } = { userId };
    if (from || to) {
      where.occurredAt = {};
      if (from) where.occurredAt.gte = from;
      if (to) {
        const end = new Date(to);
        end.setUTCHours(23, 59, 59, 999);
        where.occurredAt.lte = end;
      }
    }

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      take: limit,
      select: {
        id: true,
        amountMinor: true,
        type: true,
        category: true,
        note: true,
        occurredAt: true,
        createdAt: true,
      },
    });

    return { transactions };
  });

  app.get("/finance/summary", async (request, reply) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const userId = request.user.sub;
    const q = request.query as { days?: string };
    const days = Math.min(366, Math.max(1, parseInt(q.days ?? "30", 10) || 30));
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - days);
    from.setUTCHours(0, 0, 0, 0);

    const txs = await prisma.transaction.findMany({
      where: { userId, occurredAt: { gte: from } },
      select: { amountMinor: true, type: true, category: true },
    });

    let income = 0;
    let expense = 0;
    const byCategory: Record<string, number> = {};
    for (const t of txs) {
      if (t.type === "income") {
        income += t.amountMinor;
        byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amountMinor;
      } else {
        expense += t.amountMinor;
        byCategory[t.category] = (byCategory[t.category] ?? 0) - t.amountMinor;
      }
    }

    return {
      periodDays: days,
      totalIncomeMinor: income,
      totalExpenseMinor: expense,
      balanceMinor: income - expense,
      byCategory,
    };
  });

  app.post("/finance/transactions", async (request, reply) => {
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
    const type = body.type;
    if (type !== "income" && type !== "expense") {
      return reply.status(400).send({ error: "invalid_type" });
    }
    const amount = body.amountMinor;
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0 || amount > AMOUNT_MAX) {
      return reply.status(400).send({ error: "invalid_amount" });
    }
    const catRaw = body.category;
    if (typeof catRaw !== "string") return reply.status(400).send({ error: "invalid_category" });
    const category = catRaw.trim();
    if (category.length < 1 || category.length > CAT_MAX) {
      return reply.status(400).send({ error: "invalid_category" });
    }
    let note: string | null = null;
    if (body.note !== undefined && body.note !== null) {
      if (typeof body.note !== "string") return reply.status(400).send({ error: "invalid_note" });
      const n = body.note.trim();
      if (n.length > NOTE_MAX) return reply.status(400).send({ error: "invalid_note" });
      note = n || null;
    }
    let occurredAt = new Date();
    if (body.occurredAt !== undefined) {
      if (typeof body.occurredAt !== "string") return reply.status(400).send({ error: "invalid_date" });
      const d = new Date(body.occurredAt);
      if (Number.isNaN(d.getTime())) return reply.status(400).send({ error: "invalid_date" });
      occurredAt = d;
    }

    const row = await prisma.transaction.create({
      data: {
        userId,
        amountMinor: amount,
        type,
        category,
        note,
        occurredAt,
      },
      select: {
        id: true,
        amountMinor: true,
        type: true,
        category: true,
        note: true,
        occurredAt: true,
        createdAt: true,
      },
    });

    return reply.status(201).send({ transaction: row });
  });

  app.delete<{ Params: { id: string } }>("/finance/transactions/:id", async (request, reply) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const userId = request.user.sub;
    const { id } = request.params;
    const t = await prisma.transaction.findFirst({ where: { id, userId } });
    if (!t) return reply.status(404).send({ error: "not_found" });
    await prisma.transaction.delete({ where: { id } });
    return { ok: true };
  });
};
