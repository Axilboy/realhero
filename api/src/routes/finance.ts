import {
  type AccountType,
  type CategoryType,
  type FinanceReportingGranularity,
  type InvestmentAssetKind,
  type Prisma,
  type TransactionKind,
} from "@prisma/client";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { authPreHandler, getUserId } from "../authHook.js";
import { prisma } from "../db.js";
import {
  fetchQuoteFundamentals,
  fetchQuotePriceRub,
  searchInvestQuotes,
} from "../lib/investQuotes.js";
import {
  clampReportingDay,
  daysElapsedInPeriod,
  daysElapsedInPeriodTz,
  daysRemainingInPeriod,
  daysRemainingInPeriodTz,
  getActiveReportingPeriod,
  getActiveReportingPeriodTz,
  getCustomReportingPeriod,
  getCustomReportingPeriodTz,
  occurredAtBoundsForReporting,
  parseISODateUTC,
  totalCalendarDaysInPeriod,
} from "../lib/reportingPeriod.js";
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

/** Годовой доход с одной бумаги, ₽ → коп/год. */
function parseAnnualIncomePerUnitRub(
  raw: unknown,
):
  | { ok: true; minor: number | null }
  | { ok: false; message: string } {
  return parseAnnualCouponDividendRub(raw);
}

/** Доход с одной бумаги в месяц, ₽ → коп/мес (храним как годовой ×12 в БД). */
function parseMonthlyIncomePerUnitRub(
  raw: unknown,
):
  | { ok: true; minor: number | null }
  | { ok: false; message: string } {
  return parseAnnualCouponDividendRub(raw);
}

function parseAnnualInterestPercent(
  raw: unknown,
): { ok: true; value: number | null } | { ok: false; message: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: null };
  }
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    return { ok: false, message: "Ставка % — неотрицательное число" };
  }
  if (raw > 1000) {
    return { ok: false, message: "Ставка % слишком велика" };
  }
  return { ok: true, value: raw };
}

const FINANCE_REPORTING_GRANULARITIES: FinanceReportingGranularity[] = [
  "DAY",
  "WEEK",
  "MONTH",
  "YEAR",
  "CUSTOM",
];

function parseFinanceReportingGranularity(
  raw: unknown,
): FinanceReportingGranularity | null {
  if (typeof raw !== "string") return null;
  return FINANCE_REPORTING_GRANULARITIES.includes(
    raw as FinanceReportingGranularity,
  )
    ? (raw as FinanceReportingGranularity)
    : null;
}

function coerceAnnualPercent(
  annualPercent: number | null | undefined,
): number | null {
  if (annualPercent == null) return null;
  const p = Number(annualPercent);
  if (!Number.isFinite(p) || p <= 0) return null;
  return p;
}

function accountUsesInterestRate(a: {
  type: AccountType;
  annualInterestPercent: number | null;
}): boolean {
  if (a.type === "DEPOSIT" || a.type === "SAVINGS") return true;
  if (a.type === "BANK" && coerceAnnualPercent(a.annualInterestPercent) != null)
    return true;
  return false;
}

/** Оценка дохода по ставке за месяц, коп. */
function interestIncomeMonthMinor(
  balanceMinor: number,
  annualPercent: number | null | undefined,
): number {
  if (balanceMinor <= 0) return 0;
  const p = coerceAnnualPercent(annualPercent);
  if (p == null) return 0;
  return Math.round((balanceMinor * p) / 100 / 12);
}

/** Оценка дохода по ставке за год, коп. */
function interestIncomeYearMinor(
  balanceMinor: number,
  annualPercent: number | null | undefined,
): number {
  if (balanceMinor <= 0) return 0;
  const p = coerceAnnualPercent(annualPercent);
  if (p == null) return 0;
  return Math.round((balanceMinor * p) / 100);
}

function parseTzOffsetMin(query: { tzOffset?: string }): number | null {
  const raw = query.tzOffset;
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function reportingPeriodFromRequestQuery(
  query: { from?: string; to?: string; tzOffset?: string },
  u: {
    financeReportingDay: number | null;
    financeReportingGranularity: FinanceReportingGranularity;
  },
  now: Date,
) {
  const tzOffsetMin = parseTzOffsetMin(query);
  if (tzOffsetMin !== null) {
    if (query.from && query.to) {
      return getCustomReportingPeriodTz(query.from, query.to, tzOffsetMin);
    }
    return getActiveReportingPeriodTz(
      u.financeReportingGranularity ?? "MONTH",
      clampReportingDay(u.financeReportingDay ?? 1),
      now,
      null,
      null,
      tzOffsetMin,
    );
  }

  const fromQ = query.from ? parseISODateUTC(query.from) : null;
  const toQ = query.to ? parseISODateUTC(query.to) : null;
  if (fromQ && toQ) {
    return getCustomReportingPeriod(fromQ, toQ);
  }
  const day = clampReportingDay(u.financeReportingDay ?? 1);
  return getActiveReportingPeriod(
    u.financeReportingGranularity ?? "MONTH",
    day,
    now,
    null,
    null,
  );
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

function holdingAnnualCashflowTotalMinor(h: {
  units: number;
  annualIncomePerUnitMinor: number | null;
  annualCouponDividendMinor: number | null;
}): number {
  if (
    typeof h.annualIncomePerUnitMinor === "number" &&
    h.annualIncomePerUnitMinor > 0
  ) {
    return Math.round(h.annualIncomePerUnitMinor * h.units);
  }
  if (
    typeof h.annualCouponDividendMinor === "number" &&
    h.annualCouponDividendMinor > 0
  ) {
    return h.annualCouponDividendMinor;
  }
  return 0;
}

/** Вклады/накопительные по ставке + бумаги (купоны/дивиденды), оценка ₽/мес, коп. */
async function monthlyPassiveIncomeMinor(userId: string): Promise<number> {
  const holdings = await prisma.investmentPosition.findMany({
    where: { userId },
  });
  const accounts = await prisma.account.findMany({ where: { userId } });
  const bal = await accountBalancesMap(userId);
  let totalAnnualMinor = 0;
  let invValueMinor = 0;
  for (const h of holdings) {
    invValueMinor += holdingValueMinor(h.units, h.pricePerUnitMinor);
    totalAnnualMinor += holdingAnnualCashflowTotalMinor(h);
  }
  let depMonth = 0;
  for (const a of accounts) {
    if (!accountUsesInterestRate(a)) continue;
    const b = bal.get(a.id) ?? 0;
    depMonth += interestIncomeMonthMinor(b, a.annualInterestPercent);
  }
  const hasFlow = totalAnnualMinor > 0 && invValueMinor > 0;
  const couponMonth = hasFlow ? Math.round(totalAnnualMinor / 12) : 0;
  return depMonth + couponMonth;
}

async function refreshInvestmentQuotes(userId: string): Promise<void> {
  const rows = await prisma.investmentPosition.findMany({ where: { userId } });
  for (const h of rows) {
    const src = h.quoteSource;
    const ext = h.quoteExternalId?.trim();
    if (!src || !ext) continue;
    if (src !== "coingecko" && src !== "moex") continue;
    try {
      const mm = h.quoteMoexMarket;
      const pref =
        src === "moex"
          ? mm === "bonds" || mm === "shares"
            ? mm
            : "auto"
          : undefined;
      const r = await fetchQuotePriceRub(
        src as "coingecko" | "moex",
        ext,
        undefined,
        pref,
      );
      const ppm = Math.round(r.priceRub * 100);
      if (ppm > 0) {
        await prisma.investmentPosition.update({
          where: { id: h.id },
          data: { pricePerUnitMinor: ppm },
        });
      }
    } catch {
      /* пропуск одной позиции */
    }
  }
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
      accounts: accounts.map((a) => {
        const balanceMinor = bal.get(a.id) ?? 0;
        const useInt = accountUsesInterestRate(a);
        const month = useInt
          ? interestIncomeMonthMinor(balanceMinor, a.annualInterestPercent)
          : 0;
        const year = useInt
          ? interestIncomeYearMinor(balanceMinor, a.annualInterestPercent)
          : 0;
        return {
          ...a,
          balanceMinor,
          interestIncomeMonthMinor: month,
          interestIncomeYearMinor: year,
        };
      }),
      investmentsTotalMinor: inv,
    };
  });

  app.post("/accounts", async (request, reply) => {
    const userId = getUserId(request);
    await ensureUserHasAccounts(prisma, userId);
    const body = request.body as {
      name?: string;
      type?: AccountType;
      annualInterestPercent?: number | null;
    };
    const name = body.name?.trim() ?? "";
    if (!name || name.length > 80) {
      return reply.status(400).send({
        error: { message: "Название счёта 1–80 символов" },
      });
    }
    const t = body.type;
    if (
      t !== "CARD" &&
      t !== "CASH" &&
      t !== "BANK" &&
      t !== "DEPOSIT" &&
      t !== "SAVINGS" &&
      t !== "OTHER"
    ) {
      return reply.status(400).send({
        error: {
          message:
            "Тип: CARD, CASH, BANK, DEPOSIT (вклад), SAVINGS (накопительный), OTHER",
        },
      });
    }
    let annualInterestPercent: number | null = null;
    if (body.annualInterestPercent !== undefined) {
      const p = parseAnnualInterestPercent(body.annualInterestPercent);
      if (!p.ok) {
        return reply.status(400).send({ error: { message: p.message } });
      }
      annualInterestPercent = p.value;
    }
    if (t !== "DEPOSIT" && t !== "SAVINGS" && t !== "BANK") {
      annualInterestPercent = null;
    }
    const maxSort = await prisma.account.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
    const acc = await prisma.account.create({
      data: { userId, name, type: t, sortOrder, annualInterestPercent },
    });
    return reply.status(201).send({ account: acc });
  });

  app.patch("/accounts/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const body = request.body as {
      name?: string;
      sortOrder?: number;
      type?: AccountType;
      annualInterestPercent?: number | null;
    };
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
    if (body.type !== undefined) {
      const k = body.type;
      if (
        k !== "CARD" &&
        k !== "CASH" &&
        k !== "BANK" &&
        k !== "DEPOSIT" &&
        k !== "SAVINGS" &&
        k !== "OTHER"
      ) {
        return reply.status(400).send({
          error: { message: "Недопустимый тип счёта" },
        });
      }
    }
    const nextType = body.type ?? existing.type;
    let annualInterestPercent = existing.annualInterestPercent;
    if (body.annualInterestPercent !== undefined) {
      const p = parseAnnualInterestPercent(body.annualInterestPercent);
      if (!p.ok) {
        return reply.status(400).send({ error: { message: p.message } });
      }
      annualInterestPercent = p.value;
    }
    if (
      nextType !== "DEPOSIT" &&
      nextType !== "SAVINGS" &&
      nextType !== "BANK"
    ) {
      annualInterestPercent = null;
    }
    const updated = await prisma.account.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        annualInterestPercent,
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

  /** Перенести все операции и переводы на другой счёт и удалить счёт. */
  app.post("/accounts/:id/merge-into", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const body = request.body as { targetAccountId?: string };
    const targetId = body.targetAccountId?.trim();
    if (!targetId || targetId === id) {
      return reply.status(400).send({
        error: { message: "Укажите другой счёт для переноса операций" },
      });
    }
    const src = await prisma.account.findFirst({ where: { id, userId } });
    const tgt = await prisma.account.findFirst({
      where: { id: targetId, userId },
    });
    if (!src || !tgt) {
      return reply.status(404).send({ error: { message: "Счёт не найден" } });
    }
    const totalAcc = await prisma.account.count({ where: { userId } });
    if (totalAcc < 2) {
      return reply.status(400).send({
        error: { message: "Нельзя удалить единственный счёт" },
      });
    }
    await prisma.$transaction(async (tx) => {
      await tx.transfer.updateMany({
        where: { userId, fromAccountId: id },
        data: { fromAccountId: targetId },
      });
      await tx.transfer.updateMany({
        where: { userId, toAccountId: id },
        data: { toAccountId: targetId },
      });
      await tx.transaction.updateMany({
        where: { userId, accountId: id },
        data: { accountId: targetId },
      });
      await tx.transfer.deleteMany({
        where: { userId, fromAccountId: targetId, toAccountId: targetId },
      });
      await tx.account.delete({ where: { id } });
    });
    return { ok: true };
  });

  /**
   * Удалить счёт вместе со всеми операциями и переводами (баланс «обнуляется»).
   * Денежные следы в других счетах от связанных переводов тоже исчезают.
   */
  app.post("/accounts/:id/purge", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const existing = await prisma.account.findFirst({ where: { id, userId } });
    if (!existing) {
      return reply.status(404).send({ error: { message: "Счёт не найден" } });
    }
    await prisma.$transaction(async (tx) => {
      await tx.transfer.deleteMany({
        where: {
          userId,
          OR: [{ fromAccountId: id }, { toAccountId: id }],
        },
      });
      await tx.transaction.deleteMany({ where: { userId, accountId: id } });
      await tx.account.delete({ where: { id } });
    });
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

  app.get("/transfers", async (request, reply) => {
    const userId = getUserId(request);
    await ensureUserHasAccounts(prisma, userId);
    const q = request.query as { accountId?: string };
    const where: Prisma.TransferWhereInput = { userId };
    if (q.accountId) {
      const acc = await prisma.account.findFirst({
        where: { id: q.accountId, userId },
      });
      if (!acc) {
        return reply.status(400).send({
          error: { message: "Счёт не найден" },
        });
      }
      where.OR = [
        { fromAccountId: q.accountId },
        { toAccountId: q.accountId },
      ];
    }
    const list = await prisma.transfer.findMany({
      where,
      include: {
        fromAccount: { select: { id: true, name: true, type: true } },
        toAccount: { select: { id: true, name: true, type: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: 200,
    });
    return { transfers: list };
  });

  app.get("/investments/overview", async (request) => {
    const userId = getUserId(request);
    const qr = request.query as { refresh?: string };
    if (qr.refresh === "1" || qr.refresh === "true") {
      await refreshInvestmentQuotes(userId);
    }
    const holdings = await prisma.investmentPosition.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    });
    const accounts = await prisma.account.findMany({ where: { userId } });
    const bal = await accountBalancesMap(userId);

    let total = 0;
    let stocksMinor = 0;
    let bondsMinor = 0;
    let otherInvMinor = 0;
    let totalAnnualMinor = 0;

    const list = holdings.map((h) => {
      const valueMinor = holdingValueMinor(h.units, h.pricePerUnitMinor);
      total += valueMinor;
      if (h.assetKind === "STOCK") stocksMinor += valueMinor;
      else if (h.assetKind === "BOND") bondsMinor += valueMinor;
      else otherInvMinor += valueMinor;
      const lineAnn = holdingAnnualCashflowTotalMinor(h);
      totalAnnualMinor += lineAnn;
      return {
        id: h.id,
        name: h.name,
        assetKind: h.assetKind,
        units: h.units,
        pricePerUnitMinor: h.pricePerUnitMinor,
        valueMinor,
        annualIncomePerUnitMinor: h.annualIncomePerUnitMinor,
        annualCouponDividendMinor: h.annualCouponDividendMinor,
        annualCashflowTotalMinor: lineAnn,
        quoteSource: h.quoteSource,
        quoteExternalId: h.quoteExternalId,
        quoteMoexMarket: h.quoteMoexMarket,
        note: h.note,
        updatedAt: h.updatedAt.toISOString(),
      };
    });

    let depositsMinor = 0;
    let savingsMinor = 0;
    let allAccountsMinor = 0;
    for (const a of accounts) {
      const b = bal.get(a.id) ?? 0;
      allAccountsMinor += b;
      if (a.type === "DEPOSIT") depositsMinor += b;
      else if (a.type === "SAVINGS") savingsMinor += b;
    }
    const wealthMinor = allAccountsMinor + total;
    const portfolioSplitMinor =
      depositsMinor + savingsMinor + stocksMinor + bondsMinor + otherInvMinor;
    const pct = (part: number) =>
      portfolioSplitMinor > 0
        ? Math.round((part * 1000) / portfolioSplitMinor) / 10
        : 0;

    const depositSavingsAccounts = accounts
      .filter((a) => accountUsesInterestRate(a))
      .map((a) => {
        const balanceMinor = bal.get(a.id) ?? 0;
        const incMonth = interestIncomeMonthMinor(
          balanceMinor,
          a.annualInterestPercent,
        );
        const incYear = interestIncomeYearMinor(
          balanceMinor,
          a.annualInterestPercent,
        );
        return {
          id: a.id,
          name: a.name,
          type: a.type,
          balanceMinor,
          annualInterestPercent: a.annualInterestPercent,
          interestIncomeMonthMinor: incMonth,
          interestIncomeYearMinor: incYear,
        };
      })
      .sort((x, y) => x.name.localeCompare(y.name, "ru"));

    let depositSavingsIncomeMonthMinor = 0;
    for (const ds of depositSavingsAccounts) {
      depositSavingsIncomeMonthMinor += ds.interestIncomeMonthMinor;
    }

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
      depositSavingsAccounts,
      metrics: {
        incomePer1000YearMinor,
        couponDividendDayMinor,
        couponDividendMonthMinor,
        couponDividendYearMinor,
        depositSavingsIncomeMonthMinor,
        note:
          total === 0
            ? "Добавьте позиции. Цены по бумагам из поиска обновляются при открытии вкладки."
            : totalAnnualMinor === 0
              ? "Укажите доход с одной бумаги (кнопка «Доход») или при добавлении из поиска — подставим из MOEX, если есть данные."
              : "Доходность по введённым суммам с одной бумаги × количество (равномерно по году). Цены — по последнему обновлению котировок.",
      },
      allocation: {
        totalWealthMinor: wealthMinor,
        portfolioSplitMinor,
        depositsMinor,
        savingsMinor,
        stocksMinor,
        bondsMinor,
        otherInstrumentsMinor: otherInvMinor,
        pctDeposits: pct(depositsMinor),
        pctSavings: pct(savingsMinor),
        pctStocks: pct(stocksMinor),
        pctBonds: pct(bondsMinor),
        pctOtherInstruments: pct(otherInvMinor),
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

  app.get("/investments/quote-fundamentals", async (request, reply) => {
    const q = request.query as {
      source?: string;
      id?: string;
      assetKind?: string;
      moexMarket?: string;
    };
    const source = q.source;
    const id = String(q.id ?? "").trim();
    if (source !== "coingecko" && source !== "moex") {
      return reply.status(400).send({
        error: { message: "source: coingecko или moex" },
      });
    }
    if (!id) {
      return reply.status(400).send({ error: { message: "Укажите id" } });
    }
    const ak = q.assetKind as InvestmentAssetKind | undefined;
    if (
      ak &&
      ak !== "STOCK" &&
      ak !== "BOND" &&
      ak !== "FUND" &&
      ak !== "CRYPTO" &&
      ak !== "OTHER"
    ) {
      return reply.status(400).send({ error: { message: "assetKind" } });
    }
    const mm = q.moexMarket as "shares" | "bonds" | undefined;
    if (mm && mm !== "shares" && mm !== "bonds") {
      return reply.status(400).send({ error: { message: "moexMarket" } });
    }
    try {
      const r = await fetchQuoteFundamentals(
        source as "coingecko" | "moex",
        id,
        (ak ?? "STOCK") as InvestmentAssetKind,
        mm,
      );
      return {
        annualIncomePerUnitRub: r.annualIncomePerUnitRub,
        note: r.note,
      };
    } catch (err) {
      request.log.warn({ err }, "quote-fundamentals");
      return reply.status(502).send({
        error: { message: "Не удалось получить данные" },
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
      annualIncomePerUnitRub?: number | null;
      monthlyIncomePerUnitRub?: number | null;
      quoteSource?: string | null;
      quoteExternalId?: string | null;
      quoteMoexMarket?: string | null;
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
    if (
      typeof body.annualIncomePerUnitRub === "number" &&
      typeof body.monthlyIncomePerUnitRub === "number"
    ) {
      return reply.status(400).send({
        error: {
          message:
            "Укажите доход с одной бумаги за год или за месяц, не оба сразу",
        },
      });
    }
    let annualIncomePerUnitMinor: number | null = null;
    if (body.monthlyIncomePerUnitRub !== undefined) {
      const p = parseMonthlyIncomePerUnitRub(body.monthlyIncomePerUnitRub);
      if (!p.ok) {
        return reply.status(400).send({ error: { message: p.message } });
      }
      annualIncomePerUnitMinor =
        p.minor != null ? Math.round(p.minor * 12) : null;
    } else if (body.annualIncomePerUnitRub !== undefined) {
      const p = parseAnnualIncomePerUnitRub(body.annualIncomePerUnitRub);
      if (!p.ok) {
        return reply.status(400).send({ error: { message: p.message } });
      }
      annualIncomePerUnitMinor = p.minor;
    }
    let annualCouponDividendMinor: number | null = null;
    if (
      annualIncomePerUnitMinor == null &&
      body.annualCouponDividendRub !== undefined
    ) {
      const p = parseAnnualCouponDividendRub(body.annualCouponDividendRub);
      if (!p.ok) {
        return reply.status(400).send({ error: { message: p.message } });
      }
      annualCouponDividendMinor = p.minor;
    }
    let quoteSource: string | null = null;
    let quoteExternalId: string | null = null;
    let quoteMoexMarket: string | null = null;
    if (body.quoteSource != null && String(body.quoteSource).trim()) {
      const s = String(body.quoteSource).trim();
      if (s !== "coingecko" && s !== "moex") {
        return reply.status(400).send({ error: { message: "quoteSource" } });
      }
      quoteSource = s;
    }
    if (body.quoteExternalId != null && String(body.quoteExternalId).trim()) {
      quoteExternalId = String(body.quoteExternalId).trim().slice(0, 80);
    }
    if (body.quoteMoexMarket != null && String(body.quoteMoexMarket).trim()) {
      const m = String(body.quoteMoexMarket).trim();
      if (m !== "shares" && m !== "bonds") {
        return reply.status(400).send({ error: { message: "quoteMoexMarket" } });
      }
      quoteMoexMarket = m;
    }
    const row = await prisma.investmentPosition.create({
      data: {
        userId,
        name,
        assetKind: k,
        units,
        pricePerUnitMinor: ppm,
        annualIncomePerUnitMinor,
        annualCouponDividendMinor,
        quoteSource,
        quoteExternalId,
        quoteMoexMarket,
        note: note || null,
      },
    });
    return reply.status(201).send({
      holding: {
        ...row,
        valueMinor: holdingValueMinor(row.units, row.pricePerUnitMinor),
        annualCashflowTotalMinor: holdingAnnualCashflowTotalMinor(row),
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
      annualIncomePerUnitRub?: number | null;
      monthlyIncomePerUnitRub?: number | null;
    };
    const existing = await prisma.investmentPosition.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { message: "Позиция не найдена" } });
    }
    if (
      typeof body.annualIncomePerUnitRub === "number" &&
      typeof body.monthlyIncomePerUnitRub === "number"
    ) {
      return reply.status(400).send({
        error: {
          message:
            "Укажите доход с одной бумаги за год или за месяц, не оба сразу",
        },
      });
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
    let annualIncomePerUnitMinor = existing.annualIncomePerUnitMinor;
    let annualCouponDividendMinor = existing.annualCouponDividendMinor;
    if (body.monthlyIncomePerUnitRub !== undefined) {
      const p = parseMonthlyIncomePerUnitRub(body.monthlyIncomePerUnitRub);
      if (!p.ok) {
        return reply.status(400).send({ error: { message: p.message } });
      }
      annualIncomePerUnitMinor =
        p.minor != null ? Math.round(p.minor * 12) : null;
      annualCouponDividendMinor = null;
    } else if (body.annualIncomePerUnitRub !== undefined) {
      const p = parseAnnualIncomePerUnitRub(body.annualIncomePerUnitRub);
      if (!p.ok) {
        return reply.status(400).send({ error: { message: p.message } });
      }
      annualIncomePerUnitMinor = p.minor;
      annualCouponDividendMinor = null;
    }
    if (
      body.annualCouponDividendRub !== undefined &&
      body.annualIncomePerUnitRub === undefined &&
      body.monthlyIncomePerUnitRub === undefined
    ) {
      const p = parseAnnualCouponDividendRub(body.annualCouponDividendRub);
      if (!p.ok) {
        return reply.status(400).send({ error: { message: p.message } });
      }
      annualCouponDividendMinor = p.minor;
      annualIncomePerUnitMinor = null;
    }
    const row = await prisma.investmentPosition.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.assetKind !== undefined ? { assetKind: body.assetKind } : {}),
        units,
        pricePerUnitMinor,
        note,
        annualIncomePerUnitMinor,
        annualCouponDividendMinor,
      },
    });
    return {
      holding: {
        ...row,
        valueMinor: holdingValueMinor(row.units, row.pricePerUnitMinor),
        annualCashflowTotalMinor: holdingAnnualCashflowTotalMinor(row),
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
      accountId?: string;
    };
    let fromD: Date;
    let toD: Date;
    let occurredAt: Prisma.DateTimeFilter;
    if (q.from && q.to) {
      const fs = q.from.trim();
      const ts = q.to.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(fs)) {
        fromD = new Date(`${fs}T00:00:00.000Z`);
      } else {
        fromD = new Date(fs);
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) {
        toD = new Date(`${ts}T23:59:59.999Z`);
      } else {
        toD = new Date(ts);
      }
      if (Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime())) {
        return reply.status(400).send({
          error: { message: "Некорректные даты from/to" },
        });
      }
      occurredAt = { gte: fromD, lte: toD };
    } else {
      const now = new Date();
      fromD = new Date(now);
      const back = q.accountId ? 365 : 60;
      fromD.setUTCDate(fromD.getUTCDate() - back);
      // Без lte: операции «на сегодня» часто как полдень UTC и оказываются после now().
      occurredAt = { gte: fromD };
    }

    const where: Prisma.TransactionWhereInput = {
      userId,
      occurredAt,
    };
    if (q.kind === "INCOME" || q.kind === "EXPENSE") {
      where.kind = q.kind;
    }
    if (q.accountId) {
      const acc = await prisma.account.findFirst({
        where: { id: q.accountId, userId },
      });
      if (!acc) {
        return reply.status(400).send({ error: { message: "Счёт не найден" } });
      }
      where.accountId = q.accountId;
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
        category: { excludeFromReporting: false },
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
        category: { excludeFromReporting: false },
      },
      _sum: { amountMinor: true },
    });
    const incomeRows = await prisma.transaction.groupBy({
      by: ["categoryId"],
      where: {
        userId,
        kind: "INCOME",
        occurredAt: { gte: range.start, lt: range.end },
        category: { excludeFromReporting: false },
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

  app.get("/settings", async (request) => {
    const userId = getUserId(request);
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        financeReportingDay: true,
        financeReportingGranularity: true,
        financeReportingCustomFrom: true,
        financeReportingCustomTo: true,
      },
    });
    return {
      financeReportingDay: clampReportingDay(u?.financeReportingDay ?? 1),
      financeReportingGranularity:
        u?.financeReportingGranularity ?? "MONTH",
      financeReportingCustomFrom: u?.financeReportingCustomFrom ?? null,
      financeReportingCustomTo: u?.financeReportingCustomTo ?? null,
    };
  });

  function parseYmdString(s: string): boolean {
    return /^(\d{4})-(\d{2})-(\d{2})$/.test(s.trim());
  }

  app.patch("/settings", async (request, reply) => {
    const userId = getUserId(request);
    const body = request.body as {
      financeReportingDay?: number;
      financeReportingGranularity?: string;
      financeReportingCustomFrom?: string | null;
      financeReportingCustomTo?: string | null;
    };
    const data: {
      financeReportingDay?: number;
      financeReportingGranularity?: FinanceReportingGranularity;
      financeReportingCustomFrom?: string | null;
      financeReportingCustomTo?: string | null;
    } = {};
    if (body.financeReportingDay !== undefined) {
      const raw = body.financeReportingDay;
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        return reply.status(400).send({
          error: { message: "financeReportingDay — число 1…28" },
        });
      }
      data.financeReportingDay = clampReportingDay(raw);
    }
    if (body.financeReportingGranularity !== undefined) {
      const g = parseFinanceReportingGranularity(body.financeReportingGranularity);
      if (!g) {
        return reply.status(400).send({
          error: {
            message:
              "financeReportingGranularity: DAY, WEEK, MONTH, YEAR, CUSTOM",
          },
        });
      }
      data.financeReportingGranularity = g;
    }
    const nextGranularity =
      data.financeReportingGranularity ??
      (
        await prisma.user.findUnique({
          where: { id: userId },
          select: { financeReportingGranularity: true },
        })
      )?.financeReportingGranularity ??
      "MONTH";

    if (body.financeReportingCustomFrom !== undefined) {
      const raw = body.financeReportingCustomFrom;
      if (raw === null || raw === "") {
        data.financeReportingCustomFrom = null;
      } else if (typeof raw !== "string" || !parseYmdString(raw)) {
        return reply.status(400).send({
          error: { message: "financeReportingCustomFrom — дата YYYY-MM-DD" },
        });
      } else {
        data.financeReportingCustomFrom = raw.trim();
      }
    }
    if (body.financeReportingCustomTo !== undefined) {
      const raw = body.financeReportingCustomTo;
      if (raw === null || raw === "") {
        data.financeReportingCustomTo = null;
      } else if (typeof raw !== "string" || !parseYmdString(raw)) {
        return reply.status(400).send({
          error: { message: "financeReportingCustomTo — дата YYYY-MM-DD" },
        });
      } else {
        data.financeReportingCustomTo = raw.trim();
      }
    }

    if (
      body.financeReportingGranularity !== undefined &&
      nextGranularity !== "CUSTOM"
    ) {
      data.financeReportingCustomFrom = null;
      data.financeReportingCustomTo = null;
    } else if (
      data.financeReportingGranularity === "CUSTOM" &&
      body.financeReportingCustomFrom === undefined &&
      body.financeReportingCustomTo === undefined
    ) {
      const cur = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          financeReportingCustomFrom: true,
          financeReportingCustomTo: true,
        },
      });
      if (!cur?.financeReportingCustomFrom || !cur?.financeReportingCustomTo) {
        return reply.status(400).send({
          error: {
            message:
              "Для «Своя» укажите financeReportingCustomFrom и financeReportingCustomTo (YYYY-MM-DD)",
          },
        });
      }
    }

    if (Object.keys(data).length === 0) {
      return reply.status(400).send({
        error: {
          message:
            "Укажите financeReportingDay и/или financeReportingGranularity и/или даты CUSTOM",
        },
      });
    }
    await prisma.user.update({ where: { id: userId }, data });
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        financeReportingDay: true,
        financeReportingGranularity: true,
        financeReportingCustomFrom: true,
        financeReportingCustomTo: true,
      },
    });
    return {
      financeReportingDay: clampReportingDay(u?.financeReportingDay ?? 1),
      financeReportingGranularity:
        u?.financeReportingGranularity ?? "MONTH",
      financeReportingCustomFrom: u?.financeReportingCustomFrom ?? null,
      financeReportingCustomTo: u?.financeReportingCustomTo ?? null,
    };
  });

  app.get("/summary/reporting", async (request) => {
    const userId = getUserId(request);
    await ensureUserHasCategories(prisma, userId);
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { financeReportingDay: true, financeReportingGranularity: true },
    });
    const now = new Date();
    const q = request.query as { from?: string; to?: string; tzOffset?: string };
    const period = reportingPeriodFromRequestQuery(q, {
      financeReportingDay: u?.financeReportingDay ?? 1,
      financeReportingGranularity:
        u?.financeReportingGranularity ?? "MONTH",
    }, now);
    const day = clampReportingDay(u?.financeReportingDay ?? 1);
    const tzOffsetMin = parseTzOffsetMin(q);
    const { gte: occGte, lte: occLte } = occurredAtBoundsForReporting(
      period,
      now,
      tzOffsetMin,
    );
    const occWhere = { gte: occGte, lte: occLte };
    const [incAgg, expAgg, trAgg] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          userId,
          kind: "INCOME",
          occurredAt: occWhere,
          category: { excludeFromReporting: false },
        },
        _sum: { amountMinor: true },
      }),
      prisma.transaction.aggregate({
        where: {
          userId,
          kind: "EXPENSE",
          occurredAt: occWhere,
          category: { excludeFromReporting: false },
        },
        _sum: { amountMinor: true },
      }),
      prisma.transfer.aggregate({
        where: { userId, occurredAt: occWhere },
        _sum: { amountMinor: true },
      }),
    ]);
    const incomeMinor = incAgg._sum.amountMinor ?? 0;
    const expenseMinor = expAgg._sum.amountMinor ?? 0;
    const transferOutMinor = trAgg._sum.amountMinor ?? 0;
    const outflowMinor = expenseMinor + transferOutMinor;
    return {
      financeReportingDay: day,
      financeReportingGranularity:
        u?.financeReportingGranularity ?? "MONTH",
      periodStart: period.start.toISOString(),
      periodEndExclusive: period.endExclusive.toISOString(),
      periodLastDay: period.lastDayInclusive.toISOString().slice(0, 10),
      incomeMinor,
      expenseMinor,
      transferOutMinor,
      /** Расходы по категориям + сумма переводов за период (наглядный «отток»). */
      outflowMinor,
      balanceMinor: incomeMinor - expenseMinor,
    };
  });

  app.get("/analytics/reporting-forecast", async (request) => {
    const userId = getUserId(request);
    await ensureUserHasCategories(prisma, userId);
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { financeReportingDay: true, financeReportingGranularity: true },
    });
    const now = new Date();
    const q = request.query as { from?: string; to?: string; tzOffset?: string };
    const period = reportingPeriodFromRequestQuery(q, {
      financeReportingDay: u?.financeReportingDay ?? 1,
      financeReportingGranularity:
        u?.financeReportingGranularity ?? "MONTH",
    }, now);
    const day = clampReportingDay(u?.financeReportingDay ?? 1);
    const tzOffsetMin = parseTzOffsetMin(q);
    const { gte: occGte, lte: occLte } = occurredAtBoundsForReporting(
      period,
      now,
      tzOffsetMin,
    );
    const occWhere = { gte: occGte, lte: occLte };
    const [incAgg, expAgg] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          userId,
          kind: "INCOME",
          occurredAt: occWhere,
          category: { excludeFromReporting: false },
        },
        _sum: { amountMinor: true },
      }),
      prisma.transaction.aggregate({
        where: {
          userId,
          kind: "EXPENSE",
          occurredAt: occWhere,
          category: { excludeFromReporting: false },
        },
        _sum: { amountMinor: true },
      }),
    ]);
    const incomeMinor = incAgg._sum.amountMinor ?? 0;
    const expenseMinor = expAgg._sum.amountMinor ?? 0;
    const elapsed =
      tzOffsetMin !== null
        ? daysElapsedInPeriodTz(period, now, tzOffsetMin)
        : daysElapsedInPeriod(period, now);
    const remaining =
      tzOffsetMin !== null
        ? daysRemainingInPeriodTz(period, now, tzOffsetMin)
        : daysRemainingInPeriod(period, now);
    const totalDays = totalCalendarDaysInPeriod(period);
    const avgIncome = Math.round(incomeMinor / elapsed);
    const avgExpense = Math.round(expenseMinor / elapsed);
    const avgNet = avgIncome - avgExpense;
    const realizedNet = incomeMinor - expenseMinor;
    const projectedExtra = Math.round(avgNet * remaining);
    const projectedNetEndMinor = realizedNet + projectedExtra;
    const passiveMonthly = await monthlyPassiveIncomeMinor(userId);
    const passiveIncomeToEndMinor = Math.round((passiveMonthly / 30) * remaining);
    const expenseProjectedPeriodMinor = Math.round(
      (expenseMinor / elapsed) * totalDays,
    );
    const expectedBalanceIndicatorMinor =
      incomeMinor + passiveIncomeToEndMinor - expenseProjectedPeriodMinor;
    return {
      financeReportingDay: day,
      financeReportingGranularity:
        u?.financeReportingGranularity ?? "MONTH",
      periodStart: period.start.toISOString(),
      periodEndExclusive: period.endExclusive.toISOString(),
      periodLastDay: period.lastDayInclusive.toISOString().slice(0, 10),
      nextReportingDay: period.endExclusive.toISOString().slice(0, 10),
      totalDaysInPeriod: totalDays,
      daysElapsed: elapsed,
      daysRemaining: remaining,
      incomeMinor,
      expenseMinor,
      realizedNetMinor: realizedNet,
      avgDailyIncomeMinor: avgIncome,
      avgDailyExpenseMinor: avgExpense,
      avgDailyNetMinor: avgNet,
      projectedNetEndMinor,
      passiveIncomeToEndMinor,
      expenseProjectedPeriodMinor,
      expectedBalanceIndicatorMinor,
    };
  });
};
