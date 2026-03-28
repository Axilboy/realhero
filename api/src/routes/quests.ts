import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import { applyExpGain } from "../lib/progression.js";
import { ensureUserStats } from "../lib/ensureUserStats.js";
import { parseQuestMutate } from "../lib/questMutate.js";

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

    const parsed = parseQuestMutate(request.body as Record<string, unknown> | undefined, true);
    if (!parsed.ok) {
      return reply.status(400).send({ error: parsed.error });
    }
    const { title, rewardExp = 10, rewardCoins = 0 } = parsed.fields;
    if (!title) {
      return reply.status(400).send({ error: "invalid_title" });
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

  app.patch<{ Params: { id: string } }>("/quests/:id", async (request, reply) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const userId = request.user.sub;
    const { id } = request.params;

    const existing = await prisma.quest.findFirst({ where: { id, userId } });
    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }
    if (existing.done) {
      return reply.status(400).send({ error: "quest_completed" });
    }

    const parsed = parseQuestMutate(request.body as Record<string, unknown> | undefined, false);
    if (!parsed.ok) {
      return reply.status(400).send({ error: parsed.error });
    }

    const quest = await prisma.quest.update({
      where: { id },
      data: {
        ...(parsed.fields.title !== undefined ? { title: parsed.fields.title } : {}),
        ...(parsed.fields.rewardExp !== undefined ? { rewardExp: parsed.fields.rewardExp } : {}),
        ...(parsed.fields.rewardCoins !== undefined ? { rewardCoins: parsed.fields.rewardCoins } : {}),
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

    return { quest };
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
