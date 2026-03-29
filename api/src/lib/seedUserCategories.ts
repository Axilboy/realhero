import type { PrismaClient } from "@prisma/client";
import {
  BALANCE_ADJUSTMENT_CATEGORY_NAME,
  DEFAULT_CATEGORIES,
  INTEREST_ACCRUAL_DEBT_EXPENSE_CATEGORY_NAME,
  UNCATEGORIZED_CATEGORY_NAME,
  UNIVERSAL_CATEGORY_NAME,
} from "./defaultCategories.js";

export async function seedUserCategories(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({
      userId,
      name: c.name,
      type: c.type,
      isBuiltIn: true,
      isArchived: false,
      sortOrder: c.sortOrder,
      excludeFromReporting: c.excludeFromReporting ?? false,
    })),
  });
}

async function ensureBalanceAdjustmentCategory(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  const exists = await prisma.category.findFirst({
    where: { userId, name: BALANCE_ADJUSTMENT_CATEGORY_NAME },
  });
  if (exists) {
    const data: { excludeFromReporting?: boolean; isArchived?: boolean } = {};
    if (!exists.excludeFromReporting) data.excludeFromReporting = true;
    if (exists.isArchived) data.isArchived = false;
    if (Object.keys(data).length > 0) {
      await prisma.category.update({
        where: { id: exists.id },
        data,
      });
    }
    return;
  }
  await prisma.category.create({
    data: {
      userId,
      name: BALANCE_ADJUSTMENT_CATEGORY_NAME,
      type: "BOTH",
      isBuiltIn: true,
      isArchived: false,
      sortOrder: 1,
      excludeFromReporting: true,
    },
  });
}

/** Для пользователей, зарегистрированных до появления финансов. */
export async function ensureUserHasCategories(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  const n = await prisma.category.count({ where: { userId } });
  if (n === 0) await seedUserCategories(prisma, userId);
  await ensureBalanceAdjustmentCategory(prisma, userId);
  await ensureDebtInterestAccrualCategory(prisma, userId);
  await ensureUniversalReportingCategory(prisma, userId);
  await ensureUncategorizedCategory(prisma, userId);
}

async function ensureUncategorizedCategory(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  const exists = await prisma.category.findFirst({
    where: { userId, name: UNCATEGORIZED_CATEGORY_NAME },
  });
  if (exists) {
    if (exists.isArchived) {
      await prisma.category.update({
        where: { id: exists.id },
        data: { isArchived: false },
      });
    }
    return;
  }
  await prisma.category.create({
    data: {
      userId,
      name: UNCATEGORIZED_CATEGORY_NAME,
      type: "BOTH",
      isBuiltIn: true,
      isArchived: false,
      sortOrder: 997,
      excludeFromReporting: false,
    },
  });
}

async function ensureDebtInterestAccrualCategory(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  const exists = await prisma.category.findFirst({
    where: { userId, name: INTEREST_ACCRUAL_DEBT_EXPENSE_CATEGORY_NAME },
  });
  if (exists) return;
  await prisma.category.create({
    data: {
      userId,
      name: INTEREST_ACCRUAL_DEBT_EXPENSE_CATEGORY_NAME,
      type: "EXPENSE",
      isBuiltIn: true,
      isArchived: false,
      sortOrder: 18,
      excludeFromReporting: false,
    },
  });
}

/** Чтобы всегда можно было добавить расход/доход: хотя бы одна «обычная» категория (не служебная). */
async function ensureUniversalReportingCategory(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  const base = {
    userId,
    isArchived: false,
    excludeFromReporting: false,
  };
  const expenseOk =
    (await prisma.category.count({
      where: {
        ...base,
        OR: [{ type: "EXPENSE" }, { type: "BOTH" }],
      },
    })) > 0;
  const incomeOk =
    (await prisma.category.count({
      where: {
        ...base,
        OR: [{ type: "INCOME" }, { type: "BOTH" }],
      },
    })) > 0;

  if (expenseOk && incomeOk) return;

  const uni = await prisma.category.findFirst({
    where: { userId, name: UNIVERSAL_CATEGORY_NAME },
  });
  if (uni) {
    if (uni.isArchived || uni.excludeFromReporting) {
      await prisma.category.update({
        where: { id: uni.id },
        data: {
          isArchived: false,
          excludeFromReporting: false,
        },
      });
    }
    return;
  }

  await prisma.category.create({
    data: {
      userId,
      name: UNIVERSAL_CATEGORY_NAME,
      type: "BOTH",
      isBuiltIn: true,
      isArchived: false,
      sortOrder: 0,
      excludeFromReporting: false,
    },
  });
}
