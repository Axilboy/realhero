import type { Prisma, TaskSource } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { authPreHandler, getUserId } from "../authHook.js";
import { prisma } from "../db.js";
import { advanceQuestAfterTaskCompleted } from "../lib/questEngine.js";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseLocalDate(s: string): boolean {
  const m = DATE_RE.exec(s.trim());
  if (!m) return false;
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
}

function isTaskSource(x: unknown): x is TaskSource {
  return x === "MANUAL" || x === "QUEST";
}

function serializeTask(row: {
  id: string;
  userId: string;
  title: string;
  note: string | null;
  dueDate: string | null;
  dueTime: string | null;
  completedAt: Date | null;
  sortOrder: number;
  source: TaskSource;
  questInstanceId: string | null;
  questStepId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    note: row.note,
    dueDate: row.dueDate,
    dueTime: row.dueTime,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    sortOrder: row.sortOrder,
    source: row.source,
    questInstanceId: row.questInstanceId,
    questStepId: row.questStepId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const tasksPlugin: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", authPreHandler);

  app.get("/tasks", async (request, reply) => {
    const userId = getUserId(request);
    const q = request.query as Record<string, string | undefined>;
    const completedRaw = q.completed ?? "active";
    if (completedRaw !== "active" && completedRaw !== "done" && completedRaw !== "all") {
      return reply.status(400).send({
        error: { message: "completed: active | done | all" },
      });
    }

    const where: {
      userId: string;
      completedAt?: { not: null } | null;
    } = { userId };

    if (completedRaw === "active") {
      where.completedAt = null;
    } else if (completedRaw === "done") {
      where.completedAt = { not: null };
    }

    const rows = await prisma.userTask.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    return { tasks: rows.map(serializeTask) };
  });

  app.post("/tasks", async (request, reply) => {
    const userId = getUserId(request);
    const body = request.body as Record<string, unknown>;

    const titleRaw = body.title;
    const title =
      typeof titleRaw === "string" ? titleRaw.trim() : "";
    if (!title || title.length > 500) {
      return reply.status(400).send({
        error: { message: "title: непустая строка до 500 символов" },
      });
    }

    let note: string | null = null;
    if (body.note !== undefined && body.note !== null) {
      if (typeof body.note !== "string") {
        return reply.status(400).send({
          error: { message: "note: строка или null" },
        });
      }
      const t = body.note.trim();
      note = t.length ? t.slice(0, 4000) : null;
    }

    let dueDate: string | null = null;
    if (body.dueDate !== undefined && body.dueDate !== null) {
      if (typeof body.dueDate !== "string" || !parseLocalDate(body.dueDate)) {
        return reply.status(400).send({
          error: { message: "dueDate: YYYY-MM-DD или null" },
        });
      }
      dueDate = body.dueDate.trim();
    }

    let dueTime: string | null = null;
    if (body.dueTime !== undefined && body.dueTime !== null) {
      if (typeof body.dueTime !== "string" || !TIME_RE.test(body.dueTime.trim())) {
        return reply.status(400).send({
          error: { message: "dueTime: HH:mm или null" },
        });
      }
      dueTime = body.dueTime.trim();
    }

    let sortOrder = 0;
    if (body.sortOrder !== undefined) {
      if (
        typeof body.sortOrder !== "number" ||
        !Number.isFinite(body.sortOrder) ||
        !Number.isInteger(body.sortOrder)
      ) {
        return reply.status(400).send({
          error: { message: "sortOrder: целое число" },
        });
      }
      sortOrder = body.sortOrder;
    }

    // Клиент не задаёт QUEST — только ручные задачи; квесты — отдельным сценарием.
    let source: TaskSource = "MANUAL";
    if (body.source !== undefined) {
      if (!isTaskSource(body.source)) {
        return reply.status(400).send({
          error: { message: "source: MANUAL | QUEST" },
        });
      }
      if (body.source === "QUEST") {
        return reply.status(400).send({
          error: { message: "Создание квестовых задач только через сценарий квеста" },
        });
      }
      source = body.source;
    }

    const row = await prisma.userTask.create({
      data: {
        userId,
        title,
        note,
        dueDate,
        dueTime,
        sortOrder,
        source,
      },
    });

    return reply.status(201).send({ task: serializeTask(row) });
  });

  app.patch("/tasks/:id", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    const existing = await prisma.userTask.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { message: "Задача не найдена" } });
    }

    const data: Prisma.UserTaskUpdateInput = {};

    if (body.title !== undefined) {
      const title =
        typeof body.title === "string" ? body.title.trim() : "";
      if (!title || title.length > 500) {
        return reply.status(400).send({
          error: { message: "title: непустая строка до 500 символов" },
        });
      }
      data.title = title;
    }

    if (body.note !== undefined) {
      if (body.note === null) {
        data.note = null;
      } else if (typeof body.note === "string") {
        const t = body.note.trim();
        data.note = t.length ? t.slice(0, 4000) : null;
      } else {
        return reply.status(400).send({
          error: { message: "note: строка или null" },
        });
      }
    }

    if (body.dueDate !== undefined) {
      if (body.dueDate === null) {
        data.dueDate = null;
      } else if (typeof body.dueDate === "string" && parseLocalDate(body.dueDate)) {
        data.dueDate = body.dueDate.trim();
      } else {
        return reply.status(400).send({
          error: { message: "dueDate: YYYY-MM-DD или null" },
        });
      }
    }

    if (body.dueTime !== undefined) {
      if (body.dueTime === null) {
        data.dueTime = null;
      } else if (typeof body.dueTime === "string" && TIME_RE.test(body.dueTime.trim())) {
        data.dueTime = body.dueTime.trim();
      } else {
        return reply.status(400).send({
          error: { message: "dueTime: HH:mm или null" },
        });
      }
    }

    if (body.sortOrder !== undefined) {
      if (
        typeof body.sortOrder !== "number" ||
        !Number.isFinite(body.sortOrder) ||
        !Number.isInteger(body.sortOrder)
      ) {
        return reply.status(400).send({
          error: { message: "sortOrder: целое число" },
        });
      }
      data.sortOrder = body.sortOrder;
    }

    if (body.completed !== undefined) {
      if (body.completed === true) {
        data.completedAt = existing.completedAt ?? new Date();
      } else if (body.completed === false) {
        data.completedAt = null;
      } else {
        return reply.status(400).send({
          error: { message: "completed: boolean" },
        });
      }
    }

    if (Object.keys(data).length === 0) {
      return { task: serializeTask(existing) };
    }

    const row = await prisma.userTask.update({
      where: { id },
      data,
    });

    if (
      body.completed === true &&
      existing.completedAt === null &&
      row.source === "QUEST" &&
      row.questInstanceId &&
      row.questStepId
    ) {
      await advanceQuestAfterTaskCompleted(userId, row);
    }

    return { task: serializeTask(row) };
  });

  app.delete("/tasks/:id", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const existing = await prisma.userTask.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { message: "Задача не найдена" } });
    }

    await prisma.userTask.delete({ where: { id } });
    return reply.status(204).send();
  });
};
