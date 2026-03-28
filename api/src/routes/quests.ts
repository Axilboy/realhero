import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import { applyExpGain } from "../lib/progression.js";
import { ensureUserStats } from "../lib/ensureUserStats.js";

const TITLE_MIN = 1;
const TITLE_MAX = 200;
const EXP_MIN = 1;
const EXP_MAX = 500;
const COINS_MIN = 0;
const COINS_MAX = 1000;

export const questRoutes: FastifyPluginAsync = async (app) => {
  app.get("/quests", async (request, reply) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const userId = request.user.sub;
    await ensureUserStats(userId);

    const quests = await prisma.quest.findMany({
      where: { userId },
      orderBy: [{ done: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        done: true,
        rewardExp: true,
        rewardCoins: true,
        createdAt: true,
        completedAt: true,
      },
    });

    return { quests };
  });

  app.post("/quests", async (request, reply) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const userId = request.user.sub;
    await ensureUserStats(userId);

    const body = request.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== "object") {
      return reply.status(400).send({ error: "invalid_body" });
    }
    const titleRaw = body.title;
    if (typeof titleRaw !== "string") {
      return reply.status(400).send({ error: "invalid_title" });
    }
    const title = titleRaw.trim();
    if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
      return reply.status(400).send({ error: "invalid_title" });
    }

    let rewardExp = 10;
    if (body.rewardExp !== undefined) {
      if (typeof body.rewardExp !== "number" || !Number.isInteger(body.rewardExp)) {
        return reply.status(400).send({ error: "invalid_reward_exp" });
      }
      if (body.rewardExp < EXP_MIN || body.rewardExp > EXP_MAX) {
        return reply.status(400).send({ error: "invalid_reward_exp" });
      }
      rewardExp = body.rewardExp;
    }

    let rewardCoins = 0;
    if (body.rewardCoins !== undefined) {
      if (typeof body.rewardCoins !== "number" || !Number.isInteger(body.rewardCoins)) {
        return reply.status(400).send({ error: "invalid_reward_coins" });
      }
      if (body.rewardCoins < COINS_MIN || body.rewardCoins > COINS_MAX) {
        return reply.status(400).send({ error: "invalid_reward_coins" });
      }
      rewardCoins = body.rewardCoins;
    }

    const quest = await prisma.quest.create({
      data: {
        userId,
        title,
        rewardExp,
        rewardCoins,
      },
      select: {
        id: true,
        title: true,
        done: true,
        rewardExp: true,
        rewardCoins: true,
        createdAt: true,
        completedAt: true,
      },
    });

    return reply.status(201).send({ quest });
  });

  app.post<{ Params: { id: string } }>("/quests/:id/complete", async (request, reply) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const userId = request.user.sub;
    const { id } = request.params;

    try {
      const result = await prisma.$transaction(async (tx) => {
        const quest = await tx.quest.findFirst({
          where: { id, userId },
        });
        if (!quest) return { error: "not_found" as const };
        if (quest.done) return { error: "already_done" as const };

        await tx.quest.update({
          where: { id },
          data: { done: true, completedAt: new Date() },
        });

        const stats = await tx.userStats.findUniqueOrThrow({ where: { userId } });
        const { level, expInLevel, expToNext, leveledUp } = applyExpGain(
          stats.level,
          stats.expInLevel,
          stats.expToNext,
          quest.rewardExp
        );
        await tx.userStats.update({
          where: { userId },
          data: {
            level,
            expInLevel,
            expToNext,
            coins: stats.coins + quest.rewardCoins,
          },
        });

        return {
          ok: true as const,
          leveledUp,
          level,
          expInLevel,
          expToNext,
          coins: stats.coins + quest.rewardCoins,
          rewardExp: quest.rewardExp,
          rewardCoins: quest.rewardCoins,
        };
      });

      if (result.error === "not_found") {
        return reply.status(404).send({ error: "not_found" });
      }
      if (result.error === "already_done") {
        return reply.status(400).send({ error: "already_done" });
      }

      return result;
    } catch (e) {
      app.log.error(e);
      return reply.status(500).send({ error: "server_error" });
    }
  });

  app.delete<{ Params: { id: string } }>("/quests/:id", async (request, reply) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const userId = request.user.sub;
    const { id } = request.params;

    const q = await prisma.quest.findFirst({ where: { id, userId } });
    if (!q) {
      return reply.status(404).send({ error: "not_found" });
    }
    await prisma.quest.delete({ where: { id } });
    return { ok: true };
  });
};
