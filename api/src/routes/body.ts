import type {
  BodyLengthUnit,
  BodyMassUnit,
  ExerciseKind,
  MealSlot,
} from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { authPreHandler, getUserId } from "../authHook.js";
import { prisma } from "../db.js";
import {
  fetchOffProductByCode,
  searchOffProducts,
} from "../lib/openFoodFacts.js";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseLocalDate(s: string): boolean {
  const m = DATE_RE.exec(s.trim());
  if (!m) return false;
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
}

function isMassUnit(x: unknown): x is BodyMassUnit {
  return x === "KG" || x === "LB";
}

function isLengthUnit(x: unknown): x is BodyLengthUnit {
  return x === "CM" || x === "IN";
}

function isMealSlot(x: unknown): x is MealSlot {
  return (
    x === "BREAKFAST" ||
    x === "LUNCH" ||
    x === "DINNER" ||
    x === "SNACK"
  );
}

function isExerciseKind(x: unknown): x is ExerciseKind {
  return (
    x === "STRENGTH" ||
    x === "CARDIO" ||
    x === "STRETCH" ||
    x === "WARMUP" ||
    x === "OTHER"
  );
}

export const bodyPlugin: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", authPreHandler);

  app.get("/settings", async (request, reply) => {
    const userId = getUserId(request);
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        bodyMassUnit: true,
        bodyLengthUnit: true,
        bodyKcalGoal: true,
        bodyProteinGoalG: true,
        bodyFatGoalG: true,
        bodyCarbGoalG: true,
      },
    });
    if (!u) {
      return reply.status(404).send({ error: { message: "Пользователь не найден" } });
    }
    return {
      bodyMassUnit: u.bodyMassUnit,
      bodyLengthUnit: u.bodyLengthUnit,
      bodyKcalGoal: u.bodyKcalGoal,
      bodyProteinGoalG: u.bodyProteinGoalG,
      bodyFatGoalG: u.bodyFatGoalG,
      bodyCarbGoalG: u.bodyCarbGoalG,
    };
  });

  app.patch("/settings", async (request, reply) => {
    const userId = getUserId(request);
    const body = request.body as Record<string, unknown>;
    const data: Partial<{
      bodyMassUnit: BodyMassUnit;
      bodyLengthUnit: BodyLengthUnit;
      bodyKcalGoal: number | null;
      bodyProteinGoalG: number | null;
      bodyFatGoalG: number | null;
      bodyCarbGoalG: number | null;
    }> = {};

    if (body.bodyMassUnit !== undefined) {
      if (!isMassUnit(body.bodyMassUnit)) {
        return reply.status(400).send({
          error: { message: "bodyMassUnit: KG или LB" },
        });
      }
      data.bodyMassUnit = body.bodyMassUnit;
    }
    if (body.bodyLengthUnit !== undefined) {
      if (!isLengthUnit(body.bodyLengthUnit)) {
        return reply.status(400).send({
          error: { message: "bodyLengthUnit: CM или IN" },
        });
      }
      data.bodyLengthUnit = body.bodyLengthUnit;
    }
    if (body.bodyKcalGoal !== undefined) {
      if (body.bodyKcalGoal === null) data.bodyKcalGoal = null;
      else if (
        typeof body.bodyKcalGoal === "number" &&
        Number.isFinite(body.bodyKcalGoal) &&
        body.bodyKcalGoal >= 0
      ) {
        data.bodyKcalGoal = Math.round(body.bodyKcalGoal);
      } else {
        return reply
          .status(400)
          .send({ error: { message: "bodyKcalGoal: число ≥ 0 или null" } });
      }
    }
    for (const key of [
      "bodyProteinGoalG",
      "bodyFatGoalG",
      "bodyCarbGoalG",
    ] as const) {
      if (body[key] !== undefined) {
        if (body[key] === null) {
          data[key] = null;
        } else if (
          typeof body[key] === "number" &&
          Number.isFinite(body[key] as number) &&
          (body[key] as number) >= 0
        ) {
          data[key] = body[key] as number;
        } else {
          return reply.status(400).send({
            error: { message: `${key}: число ≥ 0 или null` },
          });
        }
      }
    }

    const u = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        bodyMassUnit: true,
        bodyLengthUnit: true,
        bodyKcalGoal: true,
        bodyProteinGoalG: true,
        bodyFatGoalG: true,
        bodyCarbGoalG: true,
      },
    });
    return u;
  });

  app.get("/measurements", async (request) => {
    const userId = getUserId(request);
    const q = request.query as { from?: string; to?: string };
    const from = q.from?.trim();
    const to = q.to?.trim();
    const where: { userId: string; date?: { gte?: string; lte?: string } } = {
      userId,
    };
    if (from && parseLocalDate(from)) where.date = { ...where.date, gte: from };
    if (to && parseLocalDate(to)) where.date = { ...where.date, lte: to };

    const rows = await prisma.bodyMeasurement.findMany({
      where,
      orderBy: { date: "desc" },
    });
    return { measurements: rows };
  });

  app.post("/measurements", async (request, reply) => {
    const userId = getUserId(request);
    const b = request.body as Record<string, unknown>;
    const date = typeof b.date === "string" ? b.date.trim() : "";
    if (!parseLocalDate(date)) {
      return reply.status(400).send({
        error: { message: "date: YYYY-MM-DD" },
      });
    }
    const row = await prisma.bodyMeasurement.create({
      data: {
        userId,
        date,
        weightKg: numOrUndef(b.weightKg),
        heightCm: numOrUndef(b.heightCm),
        bodyFatPct: numOrUndef(b.bodyFatPct),
        waistCm: numOrUndef(b.waistCm),
        hipCm: numOrUndef(b.hipCm),
        chestCm: numOrUndef(b.chestCm),
        bicepCm: numOrUndef(b.bicepCm),
        thighCm: numOrUndef(b.thighCm),
        calfCm: numOrUndef(b.calfCm),
        neckCm: numOrUndef(b.neckCm),
        note: typeof b.note === "string" ? b.note.slice(0, 2000) : null,
      },
    });
    return reply.status(201).send({ measurement: row });
  });

  app.patch("/measurements/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const existing = await prisma.bodyMeasurement.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { message: "Не найдено" } });
    }
    const b = request.body as Record<string, unknown>;
    const date =
      typeof b.date === "string" && parseLocalDate(b.date.trim())
        ? b.date.trim()
        : undefined;
    const row = await prisma.bodyMeasurement.update({
      where: { id },
      data: {
        ...(date ? { date } : {}),
        ...(b.weightKg !== undefined ? { weightKg: numOrNull(b.weightKg) } : {}),
        ...(b.heightCm !== undefined ? { heightCm: numOrNull(b.heightCm) } : {}),
        ...(b.bodyFatPct !== undefined
          ? { bodyFatPct: numOrNull(b.bodyFatPct) }
          : {}),
        ...(b.waistCm !== undefined ? { waistCm: numOrNull(b.waistCm) } : {}),
        ...(b.hipCm !== undefined ? { hipCm: numOrNull(b.hipCm) } : {}),
        ...(b.chestCm !== undefined ? { chestCm: numOrNull(b.chestCm) } : {}),
        ...(b.bicepCm !== undefined ? { bicepCm: numOrNull(b.bicepCm) } : {}),
        ...(b.thighCm !== undefined ? { thighCm: numOrNull(b.thighCm) } : {}),
        ...(b.calfCm !== undefined ? { calfCm: numOrNull(b.calfCm) } : {}),
        ...(b.neckCm !== undefined ? { neckCm: numOrNull(b.neckCm) } : {}),
        ...(b.note !== undefined
          ? { note: typeof b.note === "string" ? b.note.slice(0, 2000) : null }
          : {}),
      },
    });
    return { measurement: row };
  });

  app.delete("/measurements/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const r = await prisma.bodyMeasurement.deleteMany({ where: { id, userId } });
    if (r.count === 0) {
      return reply.status(404).send({ error: { message: "Не найдено" } });
    }
    return { ok: true };
  });

  app.get("/nutrition/day/:date", async (request, reply) => {
    const userId = getUserId(request);
    const date = (request.params as { date: string }).date?.trim() ?? "";
    if (!parseLocalDate(date)) {
      return reply.status(400).send({ error: { message: "date: YYYY-MM-DD" } });
    }
    const entries = await prisma.nutritionEntry.findMany({
      where: { userId, date },
      orderBy: [{ sortOrder: "asc" }],
    });
    const totals = entries.reduce(
      (acc, e) => ({
        kcal: acc.kcal + e.kcal,
        proteinG: acc.proteinG + e.proteinG,
        fatG: acc.fatG + e.fatG,
        carbG: acc.carbG + e.carbG,
      }),
      { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 },
    );
    return { date, entries, totals };
  });

  app.post("/nutrition/entries", async (request, reply) => {
    const userId = getUserId(request);
    const b = request.body as Record<string, unknown>;
    const date = typeof b.date === "string" ? b.date.trim() : "";
    if (!parseLocalDate(date)) {
      return reply.status(400).send({
        error: { message: "date: YYYY-MM-DD" },
      });
    }
    if (!isMealSlot(b.mealSlot)) {
      return reply.status(400).send({
        error: { message: "mealSlot: BREAKFAST|LUNCH|DINNER|SNACK" },
      });
    }
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) {
      return reply.status(400).send({ error: { message: "Укажите name" } });
    }
    const kcal = parseIntNum(b.kcal);
    if (kcal == null || kcal < 0) {
      return reply.status(400).send({ error: { message: "kcal: целое ≥ 0" } });
    }
    const p = parseFloatNum(b.proteinG) ?? 0;
    const f = parseFloatNum(b.fatG) ?? 0;
    const c = parseFloatNum(b.carbG) ?? 0;
    const maxSort = await prisma.nutritionEntry.aggregate({
      where: { userId, date },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

    const row = await prisma.nutritionEntry.create({
      data: {
        userId,
        date,
        mealSlot: b.mealSlot,
        sortOrder,
        name: name.slice(0, 200),
        portionG: parseFloatNum(b.portionG),
        kcal,
        proteinG: p,
        fatG: f,
        carbG: c,
      },
    });
    return reply.status(201).send({ entry: row });
  });

  app.patch("/nutrition/entries/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const existing = await prisma.nutritionEntry.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { message: "Не найдено" } });
    }
    const b = request.body as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.mealSlot !== undefined) {
      if (!isMealSlot(b.mealSlot)) {
        return reply.status(400).send({ error: { message: "mealSlot" } });
      }
      data.mealSlot = b.mealSlot;
    }
    if (typeof b.name === "string") data.name = b.name.trim().slice(0, 200);
    if (b.portionG !== undefined) data.portionG = parseFloatNum(b.portionG);
    if (b.kcal !== undefined) {
      const k = parseIntNum(b.kcal);
      if (k == null || k < 0) {
        return reply.status(400).send({ error: { message: "kcal" } });
      }
      data.kcal = k;
    }
    if (b.proteinG !== undefined) data.proteinG = parseFloatNum(b.proteinG) ?? 0;
    if (b.fatG !== undefined) data.fatG = parseFloatNum(b.fatG) ?? 0;
    if (b.carbG !== undefined) data.carbG = parseFloatNum(b.carbG) ?? 0;

    const row = await prisma.nutritionEntry.update({
      where: { id },
      data: data as object,
    });
    return { entry: row };
  });

  app.delete("/nutrition/entries/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const r = await prisma.nutritionEntry.deleteMany({ where: { id, userId } });
    if (r.count === 0) {
      return reply.status(404).send({ error: { message: "Не найдено" } });
    }
    return { ok: true };
  });

  /** Поиск продуктов (Open Food Facts), автодополнение. */
  app.get("/food/search", async (request, reply) => {
    const q = (request.query as { q?: string }).q?.trim() ?? "";
    if (q.length < 2) {
      return reply.status(400).send({
        error: { message: "Минимум 2 символа" },
      });
    }
    const products = await searchOffProducts(q, 15);
    return { products };
  });

  /** Штрихкод / QR (цифры кода) → КБЖУ на 100 г. */
  app.get("/food/barcode/:code", async (request, reply) => {
    const raw = (request.params as { code: string }).code ?? "";
    const product = await fetchOffProductByCode(raw);
    if (!product) {
      return reply.status(404).send({
        error: { message: "Продукт не найден в Open Food Facts" },
      });
    }
    return { product };
  });

  app.get("/user-foods", async (request) => {
    const userId = getUserId(request);
    const rows = await prisma.userFood.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }],
    });
    return { foods: rows };
  });

  app.post("/user-foods", async (request, reply) => {
    const userId = getUserId(request);
    const b = request.body as Record<string, unknown>;
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) {
      return reply.status(400).send({ error: { message: "Укажите name" } });
    }
    const kcal = parseIntNum(b.kcal);
    if (kcal == null || kcal < 0) {
      return reply.status(400).send({ error: { message: "kcal ≥ 0" } });
    }
    const p = parseFloatNum(b.proteinG) ?? 0;
    const f = parseFloatNum(b.fatG) ?? 0;
    const c = parseFloatNum(b.carbG) ?? 0;
    const row = await prisma.userFood.create({
      data: {
        userId,
        name: name.slice(0, 200),
        kcal,
        proteinG: p,
        fatG: f,
        carbG: c,
        note:
          typeof b.note === "string" ? b.note.slice(0, 500) : null,
      },
    });
    return reply.status(201).send({ food: row });
  });

  app.patch("/user-foods/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const existing = await prisma.userFood.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { message: "Не найдено" } });
    }
    const b = request.body as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (typeof b.name === "string") data.name = b.name.trim().slice(0, 200);
    if (b.kcal !== undefined) {
      const k = parseIntNum(b.kcal);
      if (k == null || k < 0) {
        return reply.status(400).send({ error: { message: "kcal" } });
      }
      data.kcal = k;
    }
    if (b.proteinG !== undefined) data.proteinG = parseFloatNum(b.proteinG) ?? 0;
    if (b.fatG !== undefined) data.fatG = parseFloatNum(b.fatG) ?? 0;
    if (b.carbG !== undefined) data.carbG = parseFloatNum(b.carbG) ?? 0;
    if (b.note !== undefined) {
      data.note =
        typeof b.note === "string" ? b.note.slice(0, 500) : null;
    }
    const row = await prisma.userFood.update({
      where: { id },
      data: data as object,
    });
    return { food: row };
  });

  app.delete("/user-foods/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const r = await prisma.userFood.deleteMany({ where: { id, userId } });
    if (r.count === 0) {
      return reply.status(404).send({ error: { message: "Не найдено" } });
    }
    return { ok: true };
  });

  app.get("/programs", async (request) => {
    const userId = getUserId(request);
    const programs = await prisma.trainingProgram.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        days: {
          orderBy: { dayIndex: "asc" },
          include: {
            exercises: { orderBy: { sortOrder: "asc" } },
          },
        },
      },
    });
    return { programs };
  });

  app.post("/programs", async (request, reply) => {
    const userId = getUserId(request);
    const b = request.body as Record<string, unknown>;
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) {
      return reply.status(400).send({ error: { message: "Укажите name" } });
    }
    const maxSort = await prisma.trainingProgram.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });
    const row = await prisma.trainingProgram.create({
      data: {
        userId,
        name: name.slice(0, 120),
        notes:
          typeof b.notes === "string" ? b.notes.slice(0, 4000) : null,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
    return reply.status(201).send({ program: row });
  });

  app.get("/programs/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const program = await prisma.trainingProgram.findFirst({
      where: { id, userId },
      include: {
        days: {
          orderBy: { dayIndex: "asc" },
          include: { exercises: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    if (!program) {
      return reply.status(404).send({ error: { message: "Не найдено" } });
    }
    return { program };
  });

  app.patch("/programs/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const existing = await prisma.trainingProgram.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { message: "Не найдено" } });
    }
    const b = request.body as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (typeof b.name === "string") data.name = b.name.trim().slice(0, 120);
    if (b.notes !== undefined) {
      data.notes =
        typeof b.notes === "string" ? b.notes.slice(0, 4000) : null;
    }
    const row = await prisma.trainingProgram.update({
      where: { id },
      data: data as object,
    });
    return { program: row };
  });

  app.delete("/programs/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const r = await prisma.trainingProgram.deleteMany({ where: { id, userId } });
    if (r.count === 0) {
      return reply.status(404).send({ error: { message: "Не найдено" } });
    }
    return { ok: true };
  });

  app.post("/programs/:id/days", async (request, reply) => {
    const userId = getUserId(request);
    const programId = (request.params as { id: string }).id;
    const p = await prisma.trainingProgram.findFirst({
      where: { id: programId, userId },
    });
    if (!p) {
      return reply.status(404).send({ error: { message: "Программа не найдена" } });
    }
    const b = request.body as Record<string, unknown>;
    const dayIndex =
      typeof b.dayIndex === "number" && Number.isFinite(b.dayIndex) && b.dayIndex >= 0
        ? Math.floor(b.dayIndex)
        : null;
    if (dayIndex === null) {
      return reply.status(400).send({ error: { message: "dayIndex: целое ≥ 0" } });
    }
    const clash = await prisma.trainingDay.findFirst({
      where: { programId, dayIndex },
    });
    if (clash) {
      return reply.status(409).send({
        error: { message: "День с таким индексом уже есть" },
      });
    }
    const row = await prisma.trainingDay.create({
      data: {
        programId,
        dayIndex,
        name:
          typeof b.name === "string" ? b.name.trim().slice(0, 80) : null,
      },
    });
    return reply.status(201).send({ day: row });
  });

  app.patch("/training-days/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const day = await prisma.trainingDay.findFirst({
      where: { id },
      include: { program: true },
    });
    if (!day || day.program.userId !== userId) {
      return reply.status(404).send({ error: { message: "Не найдено" } });
    }
    const b = request.body as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (typeof b.name === "string") data.name = b.name.trim().slice(0, 80);
    if (b.dayIndex !== undefined) {
      if (
        typeof b.dayIndex !== "number" ||
        !Number.isFinite(b.dayIndex) ||
        b.dayIndex < 0
      ) {
        return reply.status(400).send({ error: { message: "dayIndex" } });
      }
      const clash = await prisma.trainingDay.findFirst({
        where: {
          programId: day.programId,
          dayIndex: Math.floor(b.dayIndex),
          NOT: { id },
        },
      });
      if (clash) {
        return reply.status(409).send({
          error: { message: "Такой dayIndex уже занят" },
        });
      }
      data.dayIndex = Math.floor(b.dayIndex);
    }
    const row = await prisma.trainingDay.update({
      where: { id },
      data: data as object,
    });
    return { day: row };
  });

  app.delete("/training-days/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const day = await prisma.trainingDay.findFirst({
      where: { id },
      include: { program: true },
    });
    if (!day || day.program.userId !== userId) {
      return reply.status(404).send({ error: { message: "Не найдено" } });
    }
    await prisma.trainingDay.delete({ where: { id } });
    return { ok: true };
  });

  app.post("/training-days/:id/exercises", async (request, reply) => {
    const userId = getUserId(request);
    const dayId = (request.params as { id: string }).id;
    const day = await prisma.trainingDay.findFirst({
      where: { id: dayId },
      include: { program: true },
    });
    if (!day || day.program.userId !== userId) {
      return reply.status(404).send({ error: { message: "Не найдено" } });
    }
    const b = request.body as Record<string, unknown>;
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) {
      return reply.status(400).send({ error: { message: "name" } });
    }
    if (!isExerciseKind(b.kind)) {
      return reply.status(400).send({ error: { message: "kind" } });
    }
    const maxSort = await prisma.trainingExercise.aggregate({
      where: { dayId },
      _max: { sortOrder: true },
    });
    const row = await prisma.trainingExercise.create({
      data: {
        dayId,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        name: name.slice(0, 200),
        kind: b.kind,
        sets: parseIntOptional(b.sets),
        reps: parseIntOptional(b.reps),
        weightKg: parseFloatNum(b.weightKg),
        durationSec: parseIntOptional(b.durationSec),
        distanceM: parseFloatNum(b.distanceM),
        restSec: parseIntOptional(b.restSec),
        notes:
          typeof b.notes === "string" ? b.notes.slice(0, 2000) : null,
      },
    });
    return reply.status(201).send({ exercise: row });
  });

  app.patch("/training-exercises/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const ex = await prisma.trainingExercise.findFirst({
      where: { id },
      include: { day: { include: { program: true } } },
    });
    if (!ex || ex.day.program.userId !== userId) {
      return reply.status(404).send({ error: { message: "Не найдено" } });
    }
    const b = request.body as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (typeof b.name === "string") data.name = b.name.trim().slice(0, 200);
    if (b.kind !== undefined) {
      if (!isExerciseKind(b.kind)) {
        return reply.status(400).send({ error: { message: "kind" } });
      }
      data.kind = b.kind;
    }
    if (b.sets !== undefined) data.sets = parseIntOptional(b.sets);
    if (b.reps !== undefined) data.reps = parseIntOptional(b.reps);
    if (b.weightKg !== undefined) data.weightKg = parseFloatNum(b.weightKg);
    if (b.durationSec !== undefined) {
      data.durationSec = parseIntOptional(b.durationSec);
    }
    if (b.distanceM !== undefined) data.distanceM = parseFloatNum(b.distanceM);
    if (b.restSec !== undefined) data.restSec = parseIntOptional(b.restSec);
    if (b.notes !== undefined) {
      data.notes =
        typeof b.notes === "string" ? b.notes.slice(0, 2000) : null;
    }
    const row = await prisma.trainingExercise.update({
      where: { id },
      data: data as object,
    });
    return { exercise: row };
  });

  app.delete("/training-exercises/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const ex = await prisma.trainingExercise.findFirst({
      where: { id },
      include: { day: { include: { program: true } } },
    });
    if (!ex || ex.day.program.userId !== userId) {
      return reply.status(404).send({ error: { message: "Не найдено" } });
    }
    await prisma.trainingExercise.delete({ where: { id } });
    return { ok: true };
  });

  app.get("/workouts", async (request) => {
    const userId = getUserId(request);
    const q = request.query as { limit?: string };
    const limit = Math.min(50, Math.max(1, Number(q.limit) || 20));
    const logs = await prisma.workoutLog.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: limit,
      include: {
        program: { select: { id: true, name: true } },
        trainingDay: { select: { id: true, dayIndex: true, name: true } },
        lines: { orderBy: { sortOrder: "asc" } },
      },
    });
    return { workouts: logs };
  });

  app.post("/workouts", async (request, reply) => {
    const userId = getUserId(request);
    const b = request.body as Record<string, unknown>;
    let programId: string | null;
    let trainingDayId: string | null;

    if (b.programId != null) {
      if (typeof b.programId !== "string") {
        return reply.status(400).send({ error: { message: "programId" } });
      }
      const p = await prisma.trainingProgram.findFirst({
        where: { id: b.programId, userId },
      });
      if (!p) {
        return reply.status(400).send({ error: { message: "programId не найден" } });
      }
      programId = p.id;
    } else {
      programId = null;
    }

    if (b.trainingDayId != null) {
      if (typeof b.trainingDayId !== "string") {
        return reply.status(400).send({ error: { message: "trainingDayId" } });
      }
      const d = await prisma.trainingDay.findFirst({
        where: { id: b.trainingDayId },
        include: { program: true },
      });
      if (!d || d.program.userId !== userId) {
        return reply.status(400).send({
          error: { message: "trainingDayId не найден" },
        });
      }
      trainingDayId = d.id;
      if (!programId) programId = d.programId;
    } else {
      trainingDayId = null;
    }

    const startedAt =
      typeof b.startedAt === "string" ? new Date(b.startedAt) : new Date();
    if (Number.isNaN(startedAt.getTime())) {
      return reply.status(400).send({ error: { message: "startedAt" } });
    }

    const log = await prisma.workoutLog.create({
      data: {
        userId,
        programId,
        trainingDayId,
        startedAt,
        completedAt:
          b.completed === true ? new Date() : null,
        note: typeof b.note === "string" ? b.note.slice(0, 4000) : null,
      },
    });
    return reply.status(201).send({ workout: log });
  });

  app.patch("/workouts/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const existing = await prisma.workoutLog.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { message: "Не найдено" } });
    }
    const b = request.body as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (b.completedAt !== undefined) {
      if (b.completedAt === null) data.completedAt = null;
      else if (typeof b.completedAt === "string") {
        const d = new Date(b.completedAt);
        if (!Number.isNaN(d.getTime())) data.completedAt = d;
      }
    }
    if (b.completed === true && !data.completedAt) {
      data.completedAt = new Date();
    }
    if (b.note !== undefined) {
      data.note =
        typeof b.note === "string" ? b.note.slice(0, 4000) : null;
    }
    const row = await prisma.workoutLog.update({
      where: { id },
      data: data as object,
    });
    return { workout: row };
  });

  app.post("/workouts/:id/lines", async (request, reply) => {
    const userId = getUserId(request);
    const logId = (request.params as { id: string }).id;
    const log = await prisma.workoutLog.findFirst({
      where: { id: logId, userId },
    });
    if (!log) {
      return reply.status(404).send({ error: { message: "Не найдено" } });
    }
    const b = request.body as Record<string, unknown>;
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!name) {
      return reply.status(400).send({ error: { message: "name" } });
    }
    if (!isExerciseKind(b.kind)) {
      return reply.status(400).send({ error: { message: "kind" } });
    }
    const resultJson =
      typeof b.resultJson === "string" ? b.resultJson : JSON.stringify(b.resultJson ?? {});
    if (resultJson.length > 8000) {
      return reply.status(400).send({ error: { message: "resultJson слишком длинный" } });
    }
    const maxSort = await prisma.workoutLogLine.aggregate({
      where: { logId },
      _max: { sortOrder: true },
    });
    const line = await prisma.workoutLogLine.create({
      data: {
        logId,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        name: name.slice(0, 200),
        kind: b.kind,
        notes:
          typeof b.notes === "string" ? b.notes.slice(0, 2000) : null,
        resultJson,
      },
    });
    return reply.status(201).send({ line });
  });

  app.get("/workouts/:id", async (request, reply) => {
    const userId = getUserId(request);
    const id = (request.params as { id: string }).id;
    const log = await prisma.workoutLog.findFirst({
      where: { id, userId },
      include: {
        program: { select: { id: true, name: true } },
        trainingDay: true,
        lines: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!log) {
      return reply.status(404).send({ error: { message: "Не найдено" } });
    }
    return { workout: log };
  });
};

function numOrUndef(x: unknown): number | undefined {
  const n = parseFloatNum(x);
  return n === undefined || n === null ? undefined : n;
}

function numOrNull(x: unknown): number | null {
  if (x === null || x === undefined || x === "") return null;
  return parseFloatNum(x) ?? null;
}

function parseFloatNum(x: unknown): number | undefined {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "") {
    const n = Number(x.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function parseIntNum(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return Math.round(x);
  if (typeof x === "string" && x.trim() !== "") {
    const n = Number.parseInt(x, 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseIntOptional(x: unknown): number | null {
  if (x === null || x === undefined || x === "") return null;
  return parseIntNum(x);
}
