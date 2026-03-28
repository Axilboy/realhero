import {
  type AccountType,
  type CategoryType,
  type InvestmentAssetKind,
  type Prisma,
  type TransactionKind,
} from "@prisma/client";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { authPreHandler, getUserId } from "../authHook.js";
import { prisma } from "../db.js";
import { fetchQuotePriceRub, searchInvestQuotes } from "../lib/investQuotes.js";
import { ensureUserHasAccounts } from "../lib/seedUserAccounts.js";
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

/** Годовой купон+дивиденд в ₽ → коп. в БД; null = не задано. */
function parseAnnualCouponDividendRub(
  raw: unknown,
):
  | { ok: true; minor: number | null }
  | { ok: false; message: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, minor: null };
  }
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    return {
      ok: false,
      message: "Годовой купон+дивиденд (₽) — неотрицательное число",
    };
  }
  const m = toMinor(raw);
  if (m === null) return { ok: false, message: "Некорректная сумма" };
  if (m === 0) return { ok: true, minor: null };
  return { ok: true, minor: m };
}

function holdingValueMinor(units: number, pricePerUnitMinor: number): number {
  return Math.round(units * pricePerUnitMinor);
}

async function resolveAccountId(
  userId: string,
  bodyAccountId: string | undefined,
  reply: FastifyReply,
): Promise<string | undefined> {
  await ensureUserHasAccounts(prisma, userId);
  if (bodyAccountId) {
    const a = await prisma.account.findFirst({
      where: { id: bodyAccountId, userId },
    });
    if (!a) {
      reply.status(400).send({ error: { message: "Счёт не найден" } });
      return undefined;
    }
    return a.id;
  }
  const first = await prisma.account.findFirst({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  if (!first) {
    reply.status(500).send({ error: { message: "Нет счёта" } });
    return undefined;
  }
  return first.id;
}

async function accountBalancesMap(userId: string): Promise<Map<string, number>> {
  const agg = await prisma.transaction.groupBy({
    by: ["accountId", "kind"],
    where: { userId, accountId: { not: null } },
    _sum: { amountMinor: true },
  });
  const m = new Map<string, number>();
  for (const r of agg) {
    const id = r.accountId as string;
    const add = r.kind === "INCOME" ? (r._sum.amountMinor ?? 0) : -(r._sum.amountMinor ?? 0);
    m.set(id, (m.get(id) ?? 0) + add);
  }
  const trRows = await prisma.transfer.findMany({
    where: { userId },
    select: { fromAccountId: true, toAccountId: true, amountMinor: true },
  });
  for (const t of trRows) {
    m.set(t.fromAccountId, (m.get(t.fromAccountId) ?? 0) - t.amountMinor);
    m.set(t.toAccountId, (m.get(t.toAccountId) ?? 0) + t.amountMinor);
  }
  return m;
}

async function investmentsTotalMinor(userId: string): Promise<number> {
  const rows = await prisma.investmentPosition.findMany({
    where: { userId },
    select: { units: true, pricePerUnitMinor: true },
  });
  let t = 0;
  for (const r of rows) {
    t += holdingValueMinor(r.units, r.pricePerUnitMinor);
  }
  return t;
}

export const financePlugin: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", authPreHandler);

  app.get("/accounts", async (request) => {
    const userId = getUserId(request);
    await ensureUserHasAccounts(prisma, userId);
    const accounts = await prisma.account.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const bal = await accountBalancesMap(userId);
    const inv = await investmentsTotalMinor(userId);
    return {
      accounts: accounts.map((a) => ({
        ...a,
        balanceMinor: bal.get(a.id) ?? 0,
      })),
      investmentsTotalMinor: inv,
    };
  });

  app.post("/accounts", async (request, reply) => {
    const userId = getUserId(request);
    await ensureUserHasAccounts(prisma, userId);
    const body = request.body as { name?: string; type?: AccountType };
    const name = body.name?.trim() ?? "";
    if (!name || name.length > 80) {
      return reply.status(400).send({
        error: { message: "Название счёта 1–80 символов" },
      });
    }
    const t = body.type;
    if (t !== "CARD" && t !== "CASH" && t !== "BANK" && t !== "OTHER") {
      return reply.status(400).send({
        error: { message: "Тип: CARD, CASH, BANK или OTHER" },
      });
    }
    const maxSort = await prisma.account.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
    const acc = await prisma.account.create({
      data: { userId, name, type: t, sortOrder },
    });
    return reply.status(201).send({ account: acc });
  });

  app.patch("/accounts/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const body = request.body as { name?: string; sortOrder?: number };
    const existing = await prisma.account.findFirst({ where: { id, userId } });
    if (!existing) {
      return reply.status(404).send({ error: { message: "Счёт не найден" } });
    }
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name || name.length > 80) {
        return reply.status(400).send({
          error: { message: "Название 1–80 символов" },
        });
      }
    }
    const updated = await prisma.account.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      },
    });
    return { account: updated };
  });

  app.delete("/accounts/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const existing = await prisma.account.findFirst({ where: { id, userId } });
    if (!existing) {
      return reply.status(404).send({ error: { message: "Счёт не найден" } });
    }
    const cnt = await prisma.transaction.count({
      where: { userId, accountId: id },
    });
    const trCnt =
      (await prisma.transfer.count({ where: { userId, fromAccountId: id } })) +
      (await prisma.transfer.count({ where: { userId, toAccountId: id } }));
    if (cnt > 0) {
      return reply.status(400).send({
        error: {
          message: `Нельзя удалить счёт с операциями (${cnt}). Сначала удалите или перенесите операции.`,
        },
      });
    }
    if (trCnt > 0) {
      return reply.status(400).send({
        error: {
          message: `Нельзя удалить счёт: есть переводы (${trCnt}).`,
        },
      });
    }
    await prisma.account.delete({ where: { id } });
    return { ok: true };
  });

  app.post("/transfers", async (request, reply) => {
    const userId = getUserId(request);
    await ensureUserHasAccounts(prisma, userId);
    const body = request.body as {
      fromAccountId?: string;
      toAccountId?: string;
      amountRub?: number;
      note?: string;
      occurredAt?: string;
    };
    const fromId = body.fromAccountId;
    const toId = body.toAccountId;
    if (!fromId || !toId) {
      return reply.status(400).send({
        error: { message: "Укажите счёт «откуда» и «куда»" },
      });
    }
    if (fromId === toId) {
      return reply.status(400).send({
        error: { message: "Выберите два разных счёта" },
      });
    }
    const fromA = await prisma.account.findFirst({
      where: { id: fromId, userId },
    });
    const toA = await prisma.account.findFirst({
      where: { id: toId, userId },
    });
    if (!fromA || !toA) {
      return reply.status(400).send({ error: { message: "Счёт не найден" } });
    }
    const minor = toMinor(body.amountRub);
    if (minor === null || minor === 0) {
      return reply.status(400).send({
        error: { message: "Сумма перевода — положительное число (₽)" },
      });
    }
    let occurredAt = new Date();
    if (body.occurredAt) {
      occurredAt = new Date(body.occurredAt);
      if (Number.isNaN(occurredAt.getTime())) {
        return reply.status(400).send({
          error: { message: "Некорректная дата" },
        });
      }
    }
    const note =
      typeof body.note === "string" ? body.note.trim().slice(0, 500) : undefined;
    const row = await prisma.transfer.create({
      data: {
        userId,
        fromAccountId: fromId,
        toAccountId: toId,
        amountMinor: minor,
        note: note || null,
        occurredAt,
      },
    });
    return reply.status(201).send({ transfer: row });
  });

  app.get("/investments/overview", async (request) => {
    const userId = getUserId(request);
    const holdings = await prisma.investmentPosition.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    });
    let total = 0;
    let totalAnnualMinor = 0;
    const list = holdings.map((h) => {
      const valueMinor = holdingValueMinor(h.units, h.pricePerUnitMinor);
      total += valueMinor;
      const ann = h.annualCouponDividendMinor;
      if (typeof ann === "number" && ann > 0) totalAnnualMinor += ann;
      return {
        id: h.id,
        name: h.name,
        assetKind: h.assetKind,
        units: h.units,
        pricePerUnitMinor: h.pricePerUnitMinor,
        valueMinor,
        annualCouponDividendMinor: ann,
        note: h.note,
        updatedAt: h.updatedAt.toISOString(),
      };
    });
    const hasFlow = totalAnnualMinor > 0 && total > 0;
    const couponDividendYearMinor = hasFlow ? totalAnnualMinor : null;
    const couponDividendMonthMinor = hasFlow
      ? Math.round(totalAnnualMinor / 12)
      : null;
    const couponDividendDayMinor = hasFlow
      ? Math.round(totalAnnualMinor / 365)
      : null;
    const incomePer1000YearMinor = hasFlow
      ? Math.round((totalAnnualMinor * 1000 * 100) / total)
      : null;
    return {
      totalValueMinor: total,
      holdings: list,
      metrics: {
        incomePer1000YearMinor,
        couponDividendDayMinor,
        couponDividendMonthMinor,
        couponDividendYearMinor,
        note:
          total === 0
            ? "Добавьте позиции и при желании укажите ожидаемый годовой купон и дивиденды."
            : totalAnnualMinor === 0
              ? "Укажите в позициях ожидаемый годовой доход (купоны + дивиденды) — тогда появятся оценки ниже."
              : "Оценочно по введённым годовым суммам по позициям (равномерно по году).",
      },
    };
  });

  app.get("/investments/quote-search", async (request, reply) => {
    const q = String((request.query as { q?: string }).q ?? "").trim();
    if (q.length < 2) {
      return reply.status(400).send({
        error: { message: "Введите минимум 2 символа" },
      });
    }
    if (q.length > 64) {
      return reply.status(400).send({
        error: { message: "Запрос слишком длинный" },
      });
    }
    try {
      const results = await searchInvestQuotes(q);
      return { results };
    } catch (err) {
      request.log.warn({ err }, "quote-search");
      return reply.status(502).send({
        error: {
          message:
            "Котировки сейчас недоступны. Попробуйте позже или введите цену вручную.",
        },
      });
    }
  });

  app.get("/investments/quote-price", async (request, reply) => {
    const q = request.query as {
      source?: string;
      id?: string;
      date?: string;
      moexMarket?: string;
    };
    const source = q.source;
    const id = String(q.id ?? "").trim();
    if (source !== "coingecko" && source !== "moex") {
      return reply.status(400).send({
        error: { message: "Параметр source: coingecko или moex" },
      });
    }
    if (!id) {
      return reply.status(400).send({
        error: { message: "Укажите id актива" },
      });
    }
    let moexPref: "shares" | "bonds" | "auto" = "auto";
    if (source === "moex" && q.moexMarket !== undefined && q.moexMarket !== "") {
      const m = q.moexMarket.trim().toLowerCase();
      if (m === "shares" || m === "bonds") moexPref = m;
      else if (m !== "auto") {
        return reply.status(400).send({
          error: { message: "moexMarket: shares, bonds или auto" },
        });
      }
    }
    let dateYmd: string | undefined;
    if (q.date !== undefined && q.date !== "") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date)) {
        return reply.status(400).send({
          error: { message: "Дата в формате YYYY-MM-DD" },
        });
      }
      const d = new Date(`${q.date}T12:00:00.000Z`);
      if (Number.isNaN(d.getTime()) || d > new Date()) {
        return reply.status(400).send({
          error: { message: "Некорректная или будущая дата" },
        });
      }
      dateYmd = q.date;
    }
    try {
      const r = await fetchQuotePriceRub(
        source,
        id,
        dateYmd,
        source === "moex" ? moexPref : undefined,
      );
      return {
        priceRub: Math.round(r.priceRub * 100) / 100,
        asOf: r.asOf,
        note: r.note ?? null,
      };
    } catch (err) {
      request.log.warn({ err }, "quote-price");
      return reply.status(502).send({
        error: {
          message:
            "Не удалось получить цену. Другая дата или ручной ввод.",
        },
      });
    }
  });

  app.post("/investments/holdings", async (request, reply) => {
    const userId = getUserId(request);
    const body = request.body as {
      name?: string;
      assetKind?: InvestmentAssetKind;
      units?: number;
      pricePerUnitRub?: number;
      note?: string;
      annualCouponDividendRub?: number | null;
    };
    const name = body.name?.trim() ?? "";
    if (!name || name.length > 120) {
      return reply.status(400).send({
        error: { message: "Название актива 1–120 символов" },
      });
    }
    const k = body.assetKind;
    if (
      k !== "STOCK" &&
      k !== "BOND" &&
      k !== "FUND" &&
      k !== "CRYPTO" &&
      k !== "OTHER"
    ) {
      return reply.status(400).send({
        error: { message: "assetKind: STOCK, BOND, FUND, CRYPTO, OTHER" },
      });
    }
    const units = body.units;
    if (typeof units !== "number" || !Number.isFinite(units) || units <= 0) {
      return reply.status(400).send({
        error: { message: "Количество (units) — положительное число" },
      });
    }
    const ppm = toMinor(body.pricePerUnitRub);
    if (ppm === null || ppm === 0) {
      return reply.status(400).send({
        error: { message: "Цена за единицу (₽) — положительное число" },
      });
    }
    const note =
      typeof body.note === "string" ? body.note.trim().slice(0, 500) : undefined;
    let annualCouponDividendMinor: number | null = null;
    if (body.annualCouponDividendRub !== undefined) {
      const p = parseAnnualCouponDividendRub(body.annualCouponDividendRub);
      if (!p.ok) {
        return reply.status(400).send({ error: { message: p.message } });
      }
      annualCouponDividendMinor = p.minor;
    }
    const row = await prisma.investmentPosition.create({
      data: {
        userId,
        name,
        assetKind: k,
        units,
        pricePerUnitMinor: ppm,
        annualCouponDividendMinor,
        note: note || null,
      },
    });
    return reply.status(201).send({
      holding: {
        ...row,
        valueMinor: holdingValueMinor(row.units, row.pricePerUnitMinor),
      },
    });
  });

  app.patch("/investments/holdings/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const body = request.body as {
      name?: string;
      assetKind?: InvestmentAssetKind;
      units?: number;
      pricePerUnitRub?: number;
      note?: string | null;
      annualCouponDividendRub?: number | null;
    };
    const existing = await prisma.investmentPosition.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { message: "Позиция не найдена" } });
    }
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name || name.length > 120) {
        return reply.status(400).send({
          error: { message: "Название 1–120 символов" },
        });
      }
    }
    if (body.assetKind !== undefined) {
      const k = body.assetKind;
      if (
        k !== "STOCK" &&
        k !== "BOND" &&
        k !== "FUND" &&
        k !== "CRYPTO" &&
        k !== "OTHER"
      ) {
        return reply.status(400).send({ error: { message: "Недопустимый assetKind" } });
      }
    }
    let units = existing.units;
    if (body.units !== undefined) {
      if (typeof body.units !== "number" || !Number.isFinite(body.units) || body.units <= 0) {
        return reply.status(400).send({
          error: { message: "Некорректное количество" },
        });
      }
      units = body.units;
    }
    let pricePerUnitMinor = existing.pricePerUnitMinor;
    if (body.pricePerUnitRub !== undefined) {
      const ppm = toMinor(body.pricePerUnitRub);
      if (ppm === null || ppm === 0) {
        return reply.status(400).send({
          error: { message: "Некорректная цена" },
        });
      }
      pricePerUnitMinor = ppm;
    }
    let note = existing.note;
    if (body.note !== undefined) {
      note =
        body.note === null || body.note === ""
          ? null
          : String(body.note).trim().slice(0, 500);
    }
    let annualCouponDividendMinor = existing.annualCouponDividendMinor;
    if (body.annualCouponDividendRub !== undefined) {
      const p = parseAnnualCouponDividendRub(body.annualCouponDividendRub);
      if (!p.ok) {
        return reply.status(400).send({ error: { message: p.message } });
      }
      annualCouponDividendMinor = p.minor;
    }
    const row = await prisma.investmentPosition.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.assetKind !== undefined ? { assetKind: body.assetKind } : {}),
        units,
        pricePerUnitMinor,
        note,
        annualCouponDividendMinor,
      },
    });
    return {
      holding: {
        ...row,
        valueMinor: holdingValueMinor(row.units, row.pricePerUnitMinor),
      },
    };
  });

  app.delete("/investments/holdings/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const res = await prisma.investmentPosition.deleteMany({ where: { id, userId } });
    if (res.count === 0) {
      return reply.status(404).send({ error: { message: "Не найдено" } });
    }
    return { ok: true };
  });

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
    await ensureUserHasAccounts(prisma, userId);

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
      include: { category: true, account: true },
      orderBy: { occurredAt: "desc" },
      take: 200,
    });
    return { transactions: list };
  });

  app.post("/transactions", async (request, reply) => {
    const userId = getUserId(request);
    await ensureUserHasCategories(prisma, userId);

    const body = request.body as {
      accountId?: string;
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

    const accountId = await resolveAccountId(userId, body.accountId, reply);
    if (accountId === undefined) return;

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
        accountId,
        categoryId,
        kind,
        amountMinor: minor,
        note: note || null,
        occurredAt,
      },
      include: { category: true, account: true },
    });
    return reply.status(201).send({ transaction: tx });
  });

  app.patch("/transactions/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const body = request.body as {
      accountId?: string;
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

    let accountId = existing.accountId;
    if (body.accountId !== undefined) {
      await ensureUserHasAccounts(prisma, userId);
      const a = await prisma.account.findFirst({
        where: { id: body.accountId, userId },
      });
      if (!a) {
        return reply.status(400).send({ error: { message: "Счёт не найден" } });
      }
      accountId = a.id;
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
        accountId,
        categoryId,
        kind: nextKind,
        amountMinor,
        note,
        occurredAt,
      },
      include: { category: true, account: true },
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

  app.get("/summary/by-category", async (request, reply) => {
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

    const expenseRows = await prisma.transaction.groupBy({
      by: ["categoryId"],
      where: {
        userId,
        kind: "EXPENSE",
        occurredAt: { gte: range.start, lt: range.end },
      },
      _sum: { amountMinor: true },
    });
    const incomeRows = await prisma.transaction.groupBy({
      by: ["categoryId"],
      where: {
        userId,
        kind: "INCOME",
        occurredAt: { gte: range.start, lt: range.end },
      },
      _sum: { amountMinor: true },
    });

    const catIds = [
      ...new Set([
        ...expenseRows.map((r) => r.categoryId),
        ...incomeRows.map((r) => r.categoryId),
      ]),
    ];
    const cats = await prisma.category.findMany({
      where: { id: { in: catIds }, userId },
    });
    const nameById = new Map(cats.map((c) => [c.id, c.name]));

    return {
      month: ym,
      expenses: expenseRows.map((r) => ({
        categoryId: r.categoryId,
        categoryName: nameById.get(r.categoryId) ?? "—",
        amountMinor: r._sum.amountMinor ?? 0,
      })),
      incomes: incomeRows.map((r) => ({
        categoryId: r.categoryId,
        categoryName: nameById.get(r.categoryId) ?? "—",
        amountMinor: r._sum.amountMinor ?? 0,
      })),
    };
  });
};
