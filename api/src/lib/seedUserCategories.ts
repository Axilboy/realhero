import type { PrismaClient } from "@prisma/client";
import { DEFAULT_CATEGORIES } from "./defaultCategories.js";

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
    })),
  });
}

/** Для пользователей, зарегистрированных до появления финансов. */
export async function ensureUserHasCategories(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  const n = await prisma.category.count({ where: { userId } });
  if (n === 0) await seedUserCategories(prisma, userId);
}
