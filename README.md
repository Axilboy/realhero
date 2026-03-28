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

## Два шага: ПК → сервер

**Как устроен репозиторий:** один проект **web-app** — это корень Git (фронт, папка **`api/`**, скрипты **`scripts/`**). В **`api/`** лежит только бэкенд; «заливать только api» не нужно — всё в одном репозитории. PM2 запускает Node из **`web-app/api`**, поэтому после `cd api` легко оказаться там в терминале — но скрипт обновления лежит **на уровень выше**, в **`web-app/scripts/`**.

**1. На своём ПК (Git Bash), из корня репозитория** — сохранить изменения и отправить в Git:

```bash
bash scripts/push.sh
```

С суффиксом в сообщении коммита: `bash scripts/push.sh "финансы"`. Если правок в файлах нет, коммит пропускается, но выполняется **`git push`** (удобно, если коммит уже есть).

То же самое: `bash scripts/quick-push.sh` (старый вызов).

**2. На сервере (Linux, SSH)** — подтянуть код, собрать фронт в **`www`**, обновить API и перезапустить PM2 **одной командой**.

Из **корня** клона (рядом с `package.json` фронта и папкой `api/`):

```bash
cd /PROGS/RH/web-app
bash scripts/server-update.sh
```

Если ты уже в **`api/`** (как часто бывает после `prisma` / PM2), путь `scripts/...` оттуда **не существует** — либо `cd ..`, либо:

```bash
bash update-all.sh
```

(файл **`api/update-all.sh`** вызывает тот же сценарий). Либо из любой папки внутри репозитория: `bash "$(git rev-parse --show-toplevel)/scripts/server-update.sh"`.

Путь к клону замени на свой, если отличается. Статика по умолчанию: **`DEPLOY_WWW=/PROGS/RH/www`** (см. `scripts/deploy-server.sh`). Процесс PM2: **`PM2_NAME=realhero-api`**.

Первичная настройка: nginx **`location /api/`** на порт бэкенда, в **`api/.env`** — **`CORS_ORIGINS`** с твоим доменом и сильный **`JWT_SECRET`**. Подробнее: **`api/README.md`**.
