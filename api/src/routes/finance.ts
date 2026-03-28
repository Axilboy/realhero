import {
  type CategoryType,
  type Prisma,
  type TransactionKind,
} from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { authPreHandler, getUserId } from "../authHook.js";
import { prisma } from "../db.js";
import { ensureUserHasCategories } from "../lib/seedUserCategories.js";

function categoryAllowsKind(type: CategoryType, kind: TransactionKind): boolean {
  if (type === "BOTH") return true;
  return type === kind;
}

function parseMonth(ym: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const start = new Date(Date.UTC(y, mo - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, mo, 1, 0, 0, 0, 0));
  return { start, end };
}

function toMinor(amountRub: unknown): number | null {
  if (typeof amountRub !== "number" || !Number.isFinite(amountRub)) return null;
  if (amountRub < 0) return null;
  return Math.round(amountRub * 100);
}

export const financePlugin: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", authPreHandler);

  app.get("/categories", async (request) => {
    const userId = getUserId(request);
    const q = request.query as { includeArchived?: string };
    const includeArchived = q.includeArchived === "1" || q.includeArchived === "true";
    await ensureUserHasCategories(prisma, userId);

    const where: Prisma.CategoryWhereInput = { userId };
    if (!includeArchived) where.isArchived = false;

    const list = await prisma.category.findMany({
      where,
      orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
    return { categories: list };
  });

  app.post("/categories", async (request, reply) => {
    const userId = getUserId(request);
    const body = request.body as {
      name?: string;
      type?: CategoryType;
    };
    const name = body.name?.trim() ?? "";
    if (!name || name.length > 80) {
      return reply.status(400).send({
        error: { message: "Название категории 1–80 символов" },
      });
    }
    const type = body.type;
    if (type !== "EXPENSE" && type !== "INCOME" && type !== "BOTH") {
      return reply.status(400).send({
        error: { message: "Тип: EXPENSE, INCOME или BOTH" },
      });
    }

    const maxSort = await prisma.category.aggregate({
      where: { userId, type },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

    const cat = await prisma.category.create({
      data: {
        userId,
        name,
        type,
        isBuiltIn: false,
        isArchived: false,
        sortOrder,
      },
    });
    return reply.status(201).send({ category: cat });
  });

  app.patch("/categories/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const body = request.body as {
      name?: string;
      isArchived?: boolean;
      sortOrder?: number;
      type?: CategoryType;
    };

    const existing = await prisma.category.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { message: "Категория не найдена" } });
    }

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name || name.length > 80) {
        return reply.status(400).send({
          error: { message: "Название 1–80 символов" },
        });
      }
    }

    if (body.type !== undefined) {
      const t = body.type;
      if (t !== "EXPENSE" && t !== "INCOME" && t !== "BOTH") {
        return reply.status(400).send({
          error: { message: "Недопустимый тип" },
        });
      }
    }

    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.isArchived !== undefined ? { isArchived: body.isArchived } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
      },
    });
    return { category: updated };
  });

  app.get("/transactions", async (request, reply) => {
    const userId = getUserId(request);
    await ensureUserHasCategories(prisma, userId);

    const q = request.query as {
      from?: string;
      to?: string;
      kind?: string;
    };
    let fromD: Date;
    let toD: Date;
    if (q.from && q.to) {
      fromD = new Date(q.from);
      toD = new Date(q.to);
      if (Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime())) {
        return reply.status(400).send({
          error: { message: "Некорректные даты from/to" },
        });
      }
    } else {
      toD = new Date();
      fromD = new Date(toD);
      fromD.setUTCDate(fromD.getUTCDate() - 60);
    }

    const where: Prisma.TransactionWhereInput = {
      userId,
      occurredAt: { gte: fromD, lte: toD },
    };
    if (q.kind === "INCOME" || q.kind === "EXPENSE") {
      where.kind = q.kind;
    }

    const list = await prisma.transaction.findMany({
      where,
      include: { category: true },
      orderBy: { occurredAt: "desc" },
      take: 200,
    });
    return { transactions: list };
  });

  app.post("/transactions", async (request, reply) => {
    const userId = getUserId(request);
    await ensureUserHasCategories(prisma, userId);

    const body = request.body as {
      categoryId?: string;
      kind?: TransactionKind;
      amountRub?: number;
      note?: string;
      occurredAt?: string;
    };

    const kind = body.kind;
    if (kind !== "INCOME" && kind !== "EXPENSE") {
      return reply.status(400).send({
        error: { message: "kind: INCOME или EXPENSE" },
      });
    }

    const minor = toMinor(body.amountRub);
    if (minor === null || minor === 0) {
      return reply.status(400).send({
        error: { message: "Сумма должна быть положительным числом (₽)" },
      });
    }

    const categoryId = body.categoryId;
    if (!categoryId) {
      return reply.status(400).send({
        error: { message: "Укажите categoryId" },
      });
    }

    const cat = await prisma.category.findFirst({
      where: { id: categoryId, userId, isArchived: false },
    });
    if (!cat) {
      return reply.status(400).send({
        error: { message: "Категория не найдена или архивирована" },
      });
    }
    if (!categoryAllowsKind(cat.type, kind)) {
      return reply.status(400).send({
        error: { message: "Тип категории не подходит для этой операции" },
      });
    }

    let occurredAt: Date;
    if (body.occurredAt) {
      occurredAt = new Date(body.occurredAt);
      if (Number.isNaN(occurredAt.getTime())) {
        return reply.status(400).send({
          error: { message: "Некорректная дата occurredAt" },
        });
      }
    } else {
      occurredAt = new Date();
    }

    const note =
      typeof body.note === "string" ? body.note.trim().slice(0, 500) : undefined;

    const tx = await prisma.transaction.create({
      data: {
        userId,
        categoryId,
        kind,
        amountMinor: minor,
        note: note || null,
        occurredAt,
      },
      include: { category: true },
    });
    return reply.status(201).send({ transaction: tx });
  });

  app.patch("/transactions/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const body = request.body as {
      categoryId?: string;
      kind?: TransactionKind;
      amountRub?: number;
      note?: string | null;
      occurredAt?: string;
    };

    const existing = await prisma.transaction.findFirst({
      where: { id, userId },
      include: { category: true },
    });
    if (!existing) {
      return reply.status(404).send({ error: { message: "Операция не найдена" } });
    }

    const nextKind = body.kind ?? existing.kind;
    let categoryId = body.categoryId ?? existing.categoryId;

    if (body.categoryId) {
      const cat = await prisma.category.findFirst({
        where: { id: categoryId, userId, isArchived: false },
      });
      if (!cat) {
        return reply.status(400).send({
          error: { message: "Категория не найдена или архивирована" },
        });
      }
      if (!categoryAllowsKind(cat.type, nextKind)) {
        return reply.status(400).send({
          error: { message: "Тип категории не подходит" },
        });
      }
    } else if (body.kind && !categoryAllowsKind(existing.category.type, nextKind)) {
      return reply.status(400).send({
        error: { message: "Смените категорию под выбранный тип операции" },
      });
    }

    let amountMinor = existing.amountMinor;
    if (body.amountRub !== undefined) {
      const m = toMinor(body.amountRub);
      if (m === null || m === 0) {
        return reply.status(400).send({
          error: { message: "Некорректная сумма" },
        });
      }
      amountMinor = m;
    }

    let occurredAt = existing.occurredAt;
    if (body.occurredAt !== undefined) {
      const d = new Date(body.occurredAt);
      if (Number.isNaN(d.getTime())) {
        return reply.status(400).send({
          error: { message: "Некорректная дата" },
        });
      }
      occurredAt = d;
    }

    let note = existing.note;
    if (body.note !== undefined) {
      note =
        body.note === null || body.note === ""
          ? null
          : String(body.note).trim().slice(0, 500);
    }

    const tx = await prisma.transaction.update({
      where: { id },
      data: {
        categoryId,
        kind: nextKind,
        amountMinor,
        note,
        occurredAt,
      },
      include: { category: true },
    });
    return { transaction: tx };
  });

  app.delete("/transactions/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const res = await prisma.transaction.deleteMany({ where: { id, userId } });
    if (res.count === 0) {
      return reply.status(404).send({ error: { message: "Не найдено" } });
    }
    return { ok: true };
  });

  app.get("/summary", async (request, reply) => {
    const userId = getUserId(request);
    await ensureUserHasCategories(prisma, userId);

    const q = request.query as { month?: string };
    const ym = q.month ?? new Date().toISOString().slice(0, 7);
    const range = parseMonth(ym);
    if (!range) {
      return reply.status(400).send({
        error: { message: "month=YYYY-MM" },
      });
    }

    const rows = await prisma.transaction.groupBy({
      by: ["kind"],
      where: {
        userId,
        occurredAt: { gte: range.start, lt: range.end },
      },
      _sum: { amountMinor: true },
    });

    let incomeMinor = 0;
    let expenseMinor = 0;
    for (const r of rows) {
      const s = r._sum.amountMinor ?? 0;
      if (r.kind === "INCOME") incomeMinor = s;
      if (r.kind === "EXPENSE") expenseMinor = s;
    }

    return {
      month: ym,
      incomeMinor,
      expenseMinor,
      balanceMinor: incomeMinor - expenseMinor,
    };
  });
};
