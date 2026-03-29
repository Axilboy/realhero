import type { PrismaClient } from "@prisma/client";
import {
  BALANCE_ADJUSTMENT_CATEGORY_NAME,
  DEFAULT_CATEGORIES,
  INTEREST_ACCRUAL_DEBT_EXPENSE_CATEGORY_NAME,
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
    if (!exists.excludeFromReporting) {
      await prisma.category.update({
        where: { id: exists.id },
        data: { excludeFromReporting: true },
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
