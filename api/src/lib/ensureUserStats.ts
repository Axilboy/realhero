import { prisma } from "./prisma.js";
import { expRequiredForLevel } from "./progression.js";

export async function ensureUserStats(userId: string): Promise<void> {
  await prisma.userStats.upsert({
    where: { userId },
    create: {
      userId,
      level: 1,
      expInLevel: 0,
      expToNext: expRequiredForLevel(1),
      coins: 0,
      streakCount: 0,
    },
    update: {},
  });
}
