import type { FastifyPluginAsync } from "fastify";
import { authPreHandler, getUserId } from "../authHook.js";
import { prisma } from "../db.js";

/** Верхняя граница принимаемого с клиента EXP (анти-абьюз при синхронизации). */
const MAX_CLAIM_EXP = 50_000_000;

export const heroPlugin: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", authPreHandler);

  app.get("/", async (request, reply) => {
    const userId = getUserId(request);
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { heroTotalExp: true },
    });
    if (!u) {
      return reply
        .status(404)
        .send({ error: { message: "Пользователь не найден" } });
    }
    return { totalExp: u.heroTotalExp };
  });

  /**
   * Подтянуть на сервер максимум из старого localStorage и журнала событий.
   * Итог: heroTotalExp = max(текущий на сервере, clamp(заявленный)).
   */
  app.post("/sync-from-local", async (request, reply) => {
    const userId = getUserId(request);
    const body = request.body as { totalExp?: unknown };
    if (body.totalExp === undefined) {
      return reply
        .status(400)
        .send({ error: { message: "Укажите totalExp" } });
    }
    const raw = body.totalExp;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
      return reply.status(400).send({
        error: { message: "totalExp: неотрицательное число" },
      });
    }
    const claimed = Math.min(Math.floor(raw), MAX_CLAIM_EXP);

    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({
        where: { id: userId },
        select: { heroTotalExp: true },
      });
      if (!before) {
        return null;
      }
      const newExp = Math.max(before.heroTotalExp, claimed);
      const delta = newExp - before.heroTotalExp;

      if (delta > 0) {
        await tx.gamificationEvent.create({
          data: {
            userId,
            type: "LOCAL_IMPORT",
            expDelta: delta,
            payloadJson: JSON.stringify({
              previous: before.heroTotalExp,
              claimed,
            }),
          },
        });
      }

      const u = await tx.user.update({
        where: { id: userId },
        data: { heroTotalExp: newExp },
        select: { heroTotalExp: true },
      });
      return { totalExp: u.heroTotalExp, appliedDelta: delta };
    });

    if (!result) {
      return reply
        .status(404)
        .send({ error: { message: "Пользователь не найден" } });
    }
    return result;
  });
};
