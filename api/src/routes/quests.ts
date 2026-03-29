import type { FastifyPluginAsync } from "fastify";
import { authPreHandler, getUserId } from "../authHook.js";
import { prisma } from "../db.js";
import {
  QUEST_CATALOG,
  getQuestDefinition,
  totalQuestRewardXp,
} from "../lib/questCatalog.js";
import {
  abandonQuestInstance,
  startQuestForUser,
} from "../lib/questEngine.js";

export const questsPlugin: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", authPreHandler);

  app.get("/definitions", async () => {
    const quests = QUEST_CATALOG.map((q) => ({
      id: q.id,
      branch: q.branch,
      title: q.title,
      description: q.description,
      stepCount: q.steps.length,
      rewardXpTotal: totalQuestRewardXp(q),
    }));
    return { quests };
  });

  app.get("/instances", async (request) => {
    const userId = getUserId(request);
    const rows = await prisma.questInstance.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      include: {
        stepProgress: true,
      },
    });

    const instances = rows.map((r) => {
      const def = getQuestDefinition(r.questId);
      const total = def?.steps.length ?? r.stepProgress.length;
      const done = r.stepProgress.filter((p) => p.status === "DONE").length;
      return {
        id: r.id,
        questId: r.questId,
        questTitle: def?.title ?? r.questId,
        branch: def?.branch ?? null,
        status: r.status,
        startedAt: r.startedAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
        abandonedAt: r.abandonedAt?.toISOString() ?? null,
        stepsDone: done,
        stepsTotal: total,
      };
    });

    return { instances };
  });

  app.post("/instances", async (request, reply) => {
    const userId = getUserId(request);
    const body = request.body as { questId?: unknown };
    const questId =
      typeof body.questId === "string" ? body.questId.trim() : "";
    if (!questId) {
      return reply
        .status(400)
        .send({ error: { message: "Укажите questId" } });
    }

    const started = await startQuestForUser(userId, questId);
    if (!started.ok) {
      if (started.code === "UNKNOWN_QUEST") {
        return reply.status(404).send({
          error: { message: "Квест не найден" },
        });
      }
      return reply.status(409).send({
        error: { message: "Этот квест уже активен" },
      });
    }

    const inst = await prisma.questInstance.findFirst({
      where: { id: started.instanceId, userId },
      include: { stepProgress: true },
    });
    const def = getQuestDefinition(questId);
    const total = def?.steps.length ?? 0;
    const done = inst?.stepProgress.filter((p) => p.status === "DONE").length ?? 0;

    return reply.status(201).send({
      instance: {
        id: started.instanceId,
        questId,
        questTitle: def?.title ?? questId,
        branch: def?.branch ?? null,
        status: "ACTIVE",
        stepsDone: done,
        stepsTotal: total,
      },
    });
  });

  app.post("/instances/:id/abandon", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const ok = await abandonQuestInstance(userId, id);
    if (!ok) {
      return reply.status(404).send({
        error: { message: "Активный квест не найден" },
      });
    }
    return { ok: true };
  });
};
