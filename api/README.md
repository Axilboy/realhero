# Real Hero — API

HTTP API для **веб-клиента**, **Telegram Mini App** и будущих **Android / iOS** (Capacitor/React Native и т.д.): одна кодовая база бизнес-логики и данных.

## Стек

- **Node.js** + **Fastify** + **TypeScript**
- **Prisma** + **SQLite** (разработка). В проде — **PostgreSQL** (смена `provider` в `prisma/schema.prisma` и `DATABASE_URL`).

## Быстрый старт

```bash
cd api
cp .env.example .env
npm install
npx prisma db push
npm run dev
```

- `GET http://localhost:3000/health` → `{ "ok": true }`
- `GET http://localhost:3000/api/v1/meta` → версия API и список целевых клиентов

## Переменные окружения

См. `.env.example`: `PORT`, `DATABASE_URL`, `CORS_ORIGINS` (добавьте origin веба и при необходимости домены туннеля / продакшена).

## PostgreSQL (прод)

1. Создайте БД на сервере.
2. В `schema.prisma`: `provider = "postgresql"`, `url = env("DATABASE_URL")`.
3. `npx prisma migrate dev` (локально) / `migrate deploy` (CI или сервер).

## Деплой рядом с nginx

- API слушает **порт 3000** (или из `PORT`).
- В nginx: `location /api/ { proxy_pass http://127.0.0.1:3000; ... }` — префикс должен совпадать с маршрутами (`/api/v1/...`).
- Запуск: `npm run build && npm start` под **systemd** или **pm2**.

## Версия

Номер в `api/package.json` (`version`) — SemVer для бэкенда; при публичных изменениях контракта поднимайте **minor/major** и документируйте в корневом `CHANGELOG.md` или отдельной секции.

См. также **`../docs/ARCHITECTURE.md`** — веб, Telegram и нативные клиенты на одном API.
