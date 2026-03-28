# Real Hero — API

Минимальный бэкенд: **регистрация и вход по email + пароль**, без подтверждения почты.

## Локально

```bash
cd api
cp .env.example .env
# при необходимости поправьте JWT_SECRET (длинная случайная строка)
npm install
npx prisma db push
npm run dev
```

Фронт в другом терминале (`npm run dev` из корня репозитория) ходит на API через прокси **`/api` → :3000**.

## Эндпоинты

| Метод | Путь | Описание |
|--------|------|-----------|
| GET | `/health` | Проверка живости |
| POST | `/api/v1/auth/register` | Тело: `{ "email", "password" }`, пароль ≥ 8 символов. Ответ: `user` и **`token`** (JWT; дублирует cookie, если прокси режет `Set-Cookie`) |
| POST | `/api/v1/auth/login` | То же, в ответе **`token`** |
| POST | `/api/v1/auth/logout` | Сброс cookie-сессии |
| GET | `/api/v1/me` | Текущий пользователь (cookie `rh_session`) |

## Продакшен

Полное обновление сайта на сервере (фронт + API + PM2) — из корня репозитория **`bash scripts/server-update.sh`**; если терминал уже в **`api/`** — **`bash update-all.sh`** (см. корневой **`README.md`**).

- Задайте **`JWT_SECRET`**, **`NODE_ENV=production`**, **`CORS_ORIGINS`** с вашим `https://домен`.
- **Сессия (cookie `rh_session`):** в коде **`maxAge` 30 дней** и **`SameSite=Lax`**. Если при каждом заходе снова просит войти — чаще всего открываешь сайт с **другого хоста**, чем при логине (например вошёл с **`www.`**, зашёл без него или наоборот): cookie привязана к хосту. Решение: в nginx **301 с одного варианта на другой** *или* в **`api/.env`** задать **`COOKIE_DOMAIN=.твой-домен.ru`** (точка в начале — для поддоменов), перезапустить API. По умолчанию при **`NODE_ENV=production`** cookie с флагом **`Secure`** — нужен **HTTPS**, иначе браузер не сохранит сессию; для HTTP в проде задайте **`COOKIE_SECURE=false`** в **`api/.env`**.
- БД: при росте можно перейти на PostgreSQL (смена `provider` в `schema.prisma`).
- Запуск: `npm run build && npm start` под **pm2** или **systemd**; **nginx** проксирует `location /api/` на порт API (как раньше в проекте).
