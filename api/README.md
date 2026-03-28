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
- `GET /api/v1/me`, `PATCH /api/v1/me` (cookie `rh_session`) — профиль и JSON-настройки пользователя
- `GET /api/v1/dashboard` — сводка дня (нужна сессия): уровень, EXP, стрик, highlights/notifications
- `GET/POST /api/v1/quests`, `PATCH/DELETE /api/v1/quests/:id`, `POST .../complete` — квесты и награды
- `GET/POST /api/v1/finance/transactions`, `DELETE .../:id`, `GET /api/v1/finance/summary` — учёт в копейках (`amountMinor`)
- `GET/POST /api/v1/kanban/cards`, `PATCH/DELETE /api/v1/kanban/cards/:id` — колонки `todo` | `doing` | `done`
- **`GET /api/v1/openapi.json`** — черновая OpenAPI 3.0 (описание маршрутов)
- Локально при `DEV_RELAXED_AUTH=1` и не-production: `POST /api/v1/auth/dev-login` — тестовый пользователь без OAuth

## Переменные окружения

См. `.env.example`: `PORT`, `DATABASE_URL`, `CORS_ORIGINS`, `FRONTEND_URL`, `JWT_SECRET`, **Telegram** (`TELEGRAM_BOT_TOKEN`), ключи **Google / Яндекс / VK** и **redirect URI** для каждого OAuth-провайдера.

### Вход через Telegram (Login Widget)

1. Создайте бота в @BotFather, скопируйте токен в `TELEGRAM_BOT_TOKEN`.
2. Команда **`/setdomain`** — укажите домен страницы входа (тот же host, что у фронта в браузере).
3. Callback виджета: **`GET /api/v1/auth/telegram`** с query-параметрами от Telegram. Локально с Vite: `http://localhost:5173/api/v1/auth/telegram` (прокси `/api` → API), чтобы cookie `rh_session` оставались на одном origin с SPA.
4. Опционально `TELEGRAM_BOT_USERNAME` (без `@`) — иначе username подтянется один раз через `getMe`.
5. Публично: `GET /api/v1/auth/telegram/widget-info` → `{ "botUsername": "..." | null }` для отрисовки виджета на `/login`.

### Вход через OAuth (Google, Яндекс, VK)

1. Зарегистрируйте приложение у провайдера и укажите **redirect URI** ровно как в `.env` (в dev с Vite: `http://localhost:5173/api/v1/auth/<google|yandex|vk>/callback` — запросы идут на фронт-порт, **прокси** `vite.config.ts` пересылает `/api` на API).
2. В проде: один домен для SPA и `location /api/` в nginx на тот же Node; redirect URI: `https://ваш-домен/api/v1/auth/.../callback`.
3. Эндпоинты: `GET /api/v1/auth/{google|yandex|vk}` → редирект на провайдера; callback выставляет httpOnly cookie `rh_session` (JWT) и редирект на `FRONTEND_URL/`.
4. Сессия: `GET /api/v1/me`, выход: `POST /api/v1/auth/logout` (с `credentials: include` с фронта).

**Если после Google всё равно «не вошло»:** cookie `rh_session` не при `Secure`, если запрос к API идёт по HTTP (или nginx не передаёт `X-Forwarded-Proto: https` при внешнем HTTPS). В `.env` можно задать `SESSION_COOKIE_SECURE=false` для отладки. Для Cloudflare Quick Tunnel удобно `CORS_ALLOW_TRYCLOUDFLARE=1`, чтобы не дописывать новый origin в `CORS_ORIGINS` при каждом URL.

**Apple:** технически возможно (отдельный ключ `.p8` в Apple Developer); в коде пока не подключено.

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
