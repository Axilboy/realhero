import type { AccountType, PrismaClient } from "@prisma/client";
import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { accountBalancesMap } from "./accountBalances.js";
import {
  accountUsesInterestRate,
  coerceAnnualPercent,
  dailyInterestAccrualMinor,
} from "./accountInterest.js";
import {
  INTEREST_ACCRUAL_DEBT_EXPENSE_CATEGORY_NAME,
  INTEREST_ACCRUAL_INCOME_CATEGORY_NAME,
} from "./defaultCategories.js";

const LONDON = "Europe/London";

/** Полдень Europe/London для YYYY-MM-DD (строка → корректный UTC instant). */
function londonNoonInstant(ymd: string): Date {
  return fromZonedTime(`${ymd}T12:00:00`, LONDON);
}

function addOneLondonCalendarDay(ymd: string): string {
  const t = addDays(londonNoonInstant(ymd), 1);
  return formatInTimeZone(t, LONDON, "yyyy-MM-dd");
}

function todayLondonYmd(now: Date): string {
  return formatInTimeZone(now, LONDON, "yyyy-MM-dd");
}

function firstAccrualStartYmd(
  lastAccrual: string | null,
  createdAt: Date,
): string {
  if (lastAccrual) return addOneLondonCalendarDay(lastAccrual);
  return formatInTimeZone(createdAt, LONDON, "yyyy-MM-dd");
}

/**
 * Создаёт операции начисления %% за каждый пропущенный календарный день Europe/London.
 * Идемпотентно: по одному дню на счёт (поле lastInterestAccrualLondonDate).
 */
export async function applyDailyInterestAccruals(
  prisma: PrismaClient,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  const incomeCat = await prisma.category.findFirst({
    where: { userId, name: INTEREST_ACCRUAL_INCOME_CATEGORY_NAME, type: "INCOME" },
  });
  const debtCat = await prisma.category.findFirst({
    where: {
      userId,
      name: INTEREST_ACCRUAL_DEBT_EXPENSE_CATEGORY_NAME,
      type: "EXPENSE",
    },
  });
  if (!incomeCat || !debtCat) return;

  const todayYmd = todayLondonYmd(now);
  const accounts = await prisma.account.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  let bal = await accountBalancesMap(prisma, userId);

  for (const account of accounts) {
    if (!accountUsesInterestRate(account)) continue;
    if (coerceAnnualPercent(account.annualInterestPercent) == null) continue;

    let d = firstAccrualStartYmd(account.lastInterestAccrualLondonDate, account.createdAt);
    if (d > todayYmd) continue;

    while (d <= todayYmd) {
      const b = bal.get(account.id) ?? 0;
      const delta = dailyInterestAccrualMinor(
        b,
        account.annualInterestPercent,
        account.type as AccountType,
      );

      const occurredAt = londonNoonInstant(d);

      if (delta > 0) {
        await prisma.transaction.create({
          data: {
            userId,
            accountId: account.id,
            categoryId: incomeCat.id,
            kind: "INCOME",
            amountMinor: delta,
            note: `Начисление %% (${LONDON} ${d})`,
            occurredAt,
          },
        });
        bal.set(account.id, b + delta);
      } else if (delta < 0) {
        await prisma.transaction.create({
          data: {
            userId,
            accountId: account.id,
            categoryId: debtCat.id,
            kind: "EXPENSE",
            amountMinor: -delta,
            note: `Начисление %% по долгу (${LONDON} ${d})`,
            occurredAt,
          },
        });
        bal.set(account.id, b + delta);
      }

      await prisma.account.update({
        where: { id: account.id },
        data: { lastInterestAccrualLondonDate: d },
      });

      d = addOneLondonCalendarDay(d);
    }
  }
}
