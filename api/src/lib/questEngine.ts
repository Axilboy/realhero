import type { Prisma, UserTask } from "@prisma/client";
import { prisma } from "../db.js";
import { getQuestDefinition, type QuestDef } from "./questCatalog.js";

function sortSteps(def: QuestDef) {
  return [...def.steps].sort((a, b) => a.order - b.order);
}

/**
 * Создаёт экземпляр квеста и первую квестовую задачу (только текущий шаг).
 */
export async function startQuestForUser(
  userId: string,
  questId: string,
): Promise<
  | { ok: true; instanceId: string }
  | { ok: false; code: "UNKNOWN_QUEST" | "ALREADY_ACTIVE" }
> {
  const def = getQuestDefinition(questId);
  if (!def) {
    return { ok: false, code: "UNKNOWN_QUEST" };
  }

  const existing = await prisma.questInstance.findFirst({
    where: { userId, questId, status: "ACTIVE" },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, code: "ALREADY_ACTIVE" };
  }

  const ordered = sortSteps(def);

  const result = await prisma.$transaction(async (tx) => {
    const inst = await tx.questInstance.create({
      data: {
        userId,
        questId,
        status: "ACTIVE",
      },
    });

    for (const s of ordered) {
      await tx.questStepProgress.create({
        data: {
          instanceId: inst.id,
          stepId: s.id,
          orderIndex: s.order,
          status: "PENDING",
          progressTarget: 1,
        },
      });
    }

    const first = ordered[0];
    if (!first) {
      throw new Error("quest has no steps");
    }

    await tx.userTask.create({
      data: {
        userId,
        title: first.title,
        note: first.note ?? null,
        dueDate: null,
        dueTime: null,
        sortOrder: 0,
        source: "QUEST",
        questInstanceId: inst.id,
        questStepId: first.id,
      },
    });

    return inst.id;
  });

  return { ok: true, instanceId: result };
}

async function createTaskForStep(
  tx: Prisma.TransactionClient,
  userId: string,
  instanceId: string,
  def: QuestDef,
  stepId: string,
): Promise<void> {
  const step = def.steps.find((s) => s.id === stepId);
  if (!step) return;
  await tx.userTask.create({
    data: {
      userId,
      title: step.title,
      note: step.note ?? null,
      dueDate: null,
      dueTime: null,
      sortOrder: 0,
      source: "QUEST",
      questInstanceId: instanceId,
      questStepId: step.id,
    },
  });
}

/**
 * Вызывается при первом переводе задачи квеста в «выполнено».
 */
export async function advanceQuestAfterTaskCompleted(
  userId: string,
  task: UserTask,
): Promise<void> {
  if (task.source !== "QUEST" || !task.questInstanceId || !task.questStepId) {
    return;
  }

  const instanceId = task.questInstanceId;
  const stepIdDone = task.questStepId;

  const instance = await prisma.questInstance.findFirst({
    where: { id: instanceId, userId, status: "ACTIVE" },
    include: { stepProgress: true },
  });
  if (!instance) return;

  const def = getQuestDefinition(instance.questId);
  if (!def) return;

  const ordered = sortSteps(def);
  const stepXp =
    def.steps.find((s) => s.id === stepIdDone)?.rewardXp ?? 0;

  await prisma.$transaction(async (tx) => {
    const progress = await tx.questStepProgress.findFirst({
      where: { instanceId, stepId: stepIdDone },
    });
    if (!progress || progress.status === "DONE") {
      return;
    }

    await tx.questStepProgress.update({
      where: { id: progress.id },
      data: { status: "DONE", progressCurrent: progress.progressTarget },
    });

    if (stepXp > 0) {
      const before = await tx.user.findUnique({
        where: { id: userId },
        select: { heroTotalExp: true },
      });
      if (before) {
        await tx.user.update({
          where: { id: userId },
          data: { heroTotalExp: before.heroTotalExp + stepXp },
        });
        await tx.gamificationEvent.create({
          data: {
            userId,
            type: "QUEST_STEP",
            expDelta: stepXp,
            payloadJson: JSON.stringify({
              questId: instance.questId,
              instanceId,
              stepId: stepIdDone,
            }),
          },
        });
      }
    }

    const doneIds = new Set(
      (
        await tx.questStepProgress.findMany({
          where: { instanceId, status: "DONE" },
          select: { stepId: true },
        })
      ).map((r) => r.stepId),
    );

    const next = ordered.find((s) => !doneIds.has(s.id));
    if (!next) {
      await tx.questInstance.update({
        where: { id: instanceId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
      return;
    }

    await createTaskForStep(tx, userId, instanceId, def, next.id);
  });
}

export async function abandonQuestInstance(
  userId: string,
  instanceId: string,
): Promise<boolean> {
  const inst = await prisma.questInstance.findFirst({
    where: { id: instanceId, userId, status: "ACTIVE" },
  });
  if (!inst) return false;

  await prisma.$transaction(async (tx) => {
    await tx.userTask.deleteMany({
      where: {
        userId,
        questInstanceId: instanceId,
        completedAt: null,
        source: "QUEST",
      },
    });
    await tx.questInstance.update({
      where: { id: instanceId },
      data: { status: "ABANDONED", abandonedAt: new Date() },
    });
  });
  return true;
}
