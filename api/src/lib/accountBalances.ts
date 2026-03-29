import type { PrismaClient } from "@prisma/client";

export async function accountBalancesMap(
  prisma: PrismaClient,
  userId: string,
): Promise<Map<string, number>> {
  const agg = await prisma.transaction.groupBy({
    by: ["accountId", "kind"],
    where: { userId, accountId: { not: null } },
    _sum: { amountMinor: true },
  });
  const m = new Map<string, number>();
  for (const r of agg) {
    const id = r.accountId as string;
    const add =
      r.kind === "INCOME"
        ? (r._sum.amountMinor ?? 0)
        : -(r._sum.amountMinor ?? 0);
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
