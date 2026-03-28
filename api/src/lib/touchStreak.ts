import { prisma } from "./prisma.js";
import { utcTodayYmd, utcYesterdayYmd } from "./utcDate.js";

export async function touchStreak(userId: string): Promise<void> {
  const today = utcTodayYmd();
  const stats = await prisma.userStats.findUnique({ where: { userId } });
  if (!stats) return;
  if (stats.lastStreakDate === today) return;

  const y = utcYesterdayYmd();
  let nextStreak = 1;
  if (stats.lastStreakDate === y) {
    nextStreak = stats.streakCount + 1;
  }

  await prisma.userStats.update({
    where: { userId },
    data: {
      lastStreakDate: today,
      streakCount: nextStreak,
    },
  });
}
