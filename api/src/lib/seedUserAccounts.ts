import type { PrismaClient } from "@prisma/client";

/** Создаёт «Основной» счёт и привязывает старые операции без счёта. */
export async function ensureUserHasAccounts(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  let main = await prisma.account.findFirst({
    where: { userId },
    orderBy: { sortOrder: "asc" },
  });
  if (!main) {
    main = await prisma.account.create({
      data: {
        userId,
        name: "Основной",
        type: "CASH",
        sortOrder: 0,
      },
    });
  }
  await prisma.transaction.updateMany({
    where: { userId, accountId: null },
    data: { accountId: main.id },
  });
}

export async function seedUserDefaultAccount(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  const n = await prisma.account.count({ where: { userId } });
  if (n > 0) return;
  await prisma.account.create({
    data: {
      userId,
      name: "Основной",
      type: "CASH",
      sortOrder: 0,
    },
  });
}
