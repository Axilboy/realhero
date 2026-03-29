import type { Prisma, PrismaClient } from "@prisma/client";

/** Перенос операций и переводов с fromId на toId и удаление fromId (внутри транзакции). */
async function mergeAccountsInTx(
  tx: Prisma.TransactionClient,
  userId: string,
  fromId: string,
  toId: string,
): Promise<void> {
  if (fromId === toId) return;
  await tx.transfer.updateMany({
    where: { userId, fromAccountId: fromId },
    data: { fromAccountId: toId },
  });
  await tx.transfer.updateMany({
    where: { userId, toAccountId: fromId },
    data: { toAccountId: toId },
  });
  await tx.transaction.updateMany({
    where: { userId, accountId: fromId },
    data: { accountId: toId },
  });
  await tx.transfer.deleteMany({
    where: { userId, fromAccountId: toId, toAccountId: toId },
  });
  await tx.account.delete({ where: { id: fromId } });
}

/** Убирает дубликаты автосчёта «Основной» (CASH), оставляя самый старый. */
async function dedupeDefaultCashAccounts(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  const dupes = await prisma.account.findMany({
    where: { userId, name: "Основной", type: "CASH" },
    orderBy: { createdAt: "asc" },
  });
  if (dupes.length <= 1) return;
  const keeper = dupes[0]!;
  const rest = dupes.slice(1);
  await prisma.$transaction(async (tx) => {
    for (const d of rest) {
      await mergeAccountsInTx(tx, userId, d.id, keeper.id);
    }
  });
}

/**
 * Гарантирует хотя бы один счёт и привязывает операции без счёта.
 * Регистрация должна вызывать только эту функцию (не дублировать создание счёта).
 */
export async function ensureUserHasAccounts(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  await dedupeDefaultCashAccounts(prisma, userId);

  await prisma.$transaction(async (tx) => {
    const cnt = await tx.account.count({ where: { userId } });
    if (cnt === 0) {
      await tx.account.create({
        data: {
          userId,
          name: "Основной",
          type: "CASH",
          sortOrder: 0,
        },
      });
    }
  });

  const main = await prisma.account.findFirst({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  if (main) {
    await prisma.transaction.updateMany({
      where: { userId, accountId: null },
      data: { accountId: main.id },
    });
  }
}
