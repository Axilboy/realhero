import type { FastifyPluginAsync } from "fastify";
import { readApiVersion } from "../lib/readApiVersion.js";

export const openApiRoutes: FastifyPluginAsync = async (app) => {
  app.get("/openapi.json", async () => {
    const version = readApiVersion();
    return {
      openapi: "3.0.3",
      info: {
        title: "Real Hero API",
        version,
        description: "HTTP API для веб-клиента и будущих клиентов.",
      },
      servers: [{ url: "/api/v1", description: "Версионированный префикс" }],
      paths: {
        "/meta": { get: { summary: "Версия API", tags: ["meta"] } },
        "/me": {
          get: { summary: "Текущий пользователь (cookie rh_session)", tags: ["session"] },
          patch: { summary: "Обновить профиль / settings", tags: ["session"] },
        },
        "/dashboard": { get: { summary: "Сводка дашборда", tags: ["game"] } },
        "/quests": {
          get: { summary: "Список квестов", tags: ["quests"] },
          post: { summary: "Создать квест", tags: ["quests"] },
        },
        "/quests/{id}/complete": { post: { summary: "Завершить квест", tags: ["quests"] } },
        "/quests/{id}": {
          patch: { summary: "Изменить квест", tags: ["quests"] },
          delete: { summary: "Удалить квест", tags: ["quests"] },
        },
        "/finance/transactions": {
          get: { summary: "Список транзакций", tags: ["finance"] },
          post: { summary: "Добавить транзакцию", tags: ["finance"] },
        },
        "/finance/transactions/{id}": { delete: { summary: "Удалить транзакцию", tags: ["finance"] } },
        "/finance/summary": { get: { summary: "Сводка за период", tags: ["finance"] } },
        "/kanban/cards": {
          get: { summary: "Карточки канбана", tags: ["kanban"] },
          post: { summary: "Новая карточка", tags: ["kanban"] },
        },
        "/kanban/cards/{id}": {
          patch: { summary: "Перенос / правка карточки", tags: ["kanban"] },
          delete: { summary: "Удалить карточку", tags: ["kanban"] },
        },
      },
      components: {
        securitySchemes: {
          cookieAuth: {
            type: "apiKey",
            in: "cookie",
            name: "rh_session",
          },
        },
      },
    };
  });
};
