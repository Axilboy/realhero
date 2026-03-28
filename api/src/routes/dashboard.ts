import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import { readDashboardHints } from "../lib/dashboardHints.js";
import { ensureUserStats } from "../lib/ensureUserStats.js";
import { touchStreak } from "../lib/touchStreak.js";

function startOfUtcToday(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get("/dashboard", async (request, reply) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const userId = request.user.sub;

    await ensureUserStats(userId);
    await touchStreak(userId);

    const [user, stats, openCount, completedToday] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { settings: true },
      }),
      prisma.userStats.findUniqueOrThrow({ where: { userId } }),
      prisma.quest.count({ where: { userId, done: false } }),
      prisma.quest.count({
        where: {
          userId,
          done: true,
          completedAt: { gte: startOfUtcToday() },
        },
      }),
    ]);

    const hints = readDashboardHints(user?.settings);

    const highlights: string[] = [];
    if (openCount > 0) {
      highlights.push(
        openCount === 1
          ? "1 активный квест — открой раздел «Квесты» и отметь выполнение."
          : `${openCount} активных квестов — раздел «Квесты».`
      );
    } else {
      highlights.push("Добавь первый квест в разделе «Квесты» — за выполнение начисляется EXP и монеты.");
    }
    if (hints) {
      highlights.push("Центр — сводка дня. Свайпы: влево финансы, вправо здоровье, вверх канбан, вниз квесты.");
      highlights.push("История версий — ссылка сверху.");
    }

    const notifications: { id: string; text: string; tone: "info" | "warn" | "success" }[] = [];
    if (hints) {
      notifications.push({
        id: "coins",
        text: `Монеты: ${stats.coins}. Потратить на косметику героя — в следующих релизах.`,
        tone: "info",
      });
    }
    if (stats.streakCount > 0) {
      notifications.push({
        id: "streak",
        text: `Серия дней подряд: ${stats.streakCount}. Заходи хотя бы раз в день (UTC), чтобы не сбросить.`,
        tone: "success",
      });
    }
    if (completedToday > 0) {
      notifications.push({
        id: "today",
        text: `Сегодня выполнено квестов: ${completedToday}.`,
        tone: "success",
      });
    }
    if (openCount >= 8) {
      notifications.push({
        id: "overload",
        text: "Много открытых квестов — может, закрыть или удалить часть?",
        tone: "warn",
      });
    }

    return {
      greeting: "Добро пожаловать, герой",
      level: stats.level,
      expCurrent: stats.expInLevel,
      expToNext: stats.expToNext,
      streakDays: stats.streakCount,
      highlights,
      notifications,
    };
  });
};
