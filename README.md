# Real Hero

Фронтенд: **Vite + React + TypeScript**. API: каталог **`api/`** (Fastify + Prisma + SQLite) — регистрация и вход по **email и паролю** (без подтверждения почты).

## Локально (два терминала)

**Терминал 1 — API** (Git Bash или PowerShell):

```bash
cd api
cp .env.example .env
npm install
npx prisma db push
npm run dev
```

**Терминал 2 — фронт** (из корня репозитория):

```bash
npm install
npm run dev
```

Открой `http://localhost:5173` — сначала форма входа; можно зарегистрироваться на `/register`. Запросы на **`/api`** в dev проксируются на `http://127.0.0.1:3000`.

Сборка фронта: `npm run build`. Подробнее по API: **`api/README.md`**.

## Деплой на сервер

Статика после `git push`:

```bash
cd /PROGS/RH/web-app
git pull origin master
./scripts/deploy-server.sh
```

Отдельно на сервере подними API (`api/`: `npm ci`, `prisma db push`, `npm run build`, `npm start` или pm2) и nginx **`location /api/`** на порт бэкенда. В **`api/.env`** укажи **`CORS_ORIGINS`** с `https://твой-домен` и сильный **`JWT_SECRET`**.

## Быстрый push (Git Bash)

```bash
bash scripts/quick-push.sh
```

Сообщение коммита — дата и время; опционально суффикс: `bash scripts/quick-push.sh "wip"`.
