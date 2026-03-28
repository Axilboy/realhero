# Real Hero — API

Бэкенд приложения **Real Hero**: аутентификация по **email + паролю** (без подтверждения почты), персональный **финансовый** модуль (счета, операции, инвестиции, котировки).

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

Префикс бизнес-логики финансов: **`/api/v1/finance/`** (ниже пути относительно этого префикса, если не указано иное).

### Система и авторизация

| Метод | Путь | Описание |
|--------|------|-----------|
| GET | `/health` | Проверка живости |
| POST | `/api/v1/auth/register` | Тело: `{ "email", "password" }`, пароль ≥ 8 символов. Ответ: `user` и **`token`** (JWT; дублирует cookie, если прокси режет `Set-Cookie`) |
| POST | `/api/v1/auth/login` | То же, в ответе **`token`** |
| POST | `/api/v1/auth/logout` | Сброс cookie-сессии |
| GET | `/api/v1/me` | Текущий пользователь (cookie `rh_session`) |

### Финансы (нужна сессия)

Все маршруты ниже — **`/api/v1/finance/...`**.

| Метод | Путь | Описание |
|--------|------|-----------|
| GET | `/accounts` | Счета и балансы, сумма по инвестициям |
| POST | `/accounts` | Создать счёт |
| PATCH | `/accounts/:id` | Изменить счёт |
| DELETE | `/accounts/:id` | Удалить счёт |
| POST | `/transfers` | Перевод между счетами |
| GET | `/categories` | Категории (`?includeArchived=1` — с архивными) |
| POST | `/categories` | Новая категория |
| PATCH | `/categories/:id` | Изменить / архив |
| GET | `/transactions` | Операции (`?from=&to=` ISO-даты) |
| POST | `/transactions` | Расход или доход |
| PATCH | `/transactions/:id` | Правка операции |
| DELETE | `/transactions/:id` | Удаление |
| GET | `/summary` | Сводка за месяц `?month=YYYY-MM` |
| GET | `/summary/by-category` | Расходы/доходы по категориям за месяц |
| GET | `/investments/overview` | Портфель, метрики, **`allocation`** (структура счётов и инвестиций). **`?refresh=1`** — обновить цены по сохранённым котировкам |
| GET | `/investments/quote-search` | Поиск: `?q=` (≥2 символа), MOEX + CoinGecko |
| GET | `/investments/quote-price` | `source`, `id`, опционально `date`, `moexMarket` — цена в ₽ |
| GET | `/investments/quote-fundamentals` | `source`, `id`, `assetKind`, опционально `moexMarket` — оценка **₽/год с одной бумаги** (купон/дивиденды MOEX) |
| POST | `/investments/holdings` | Новая позиция (в т.ч. `quote*`, `annualIncomePerUnitRub`, legacy `annualCouponDividendRub`) |
| PATCH | `/investments/holdings/:id` | Правка позиции |
| DELETE | `/investments/holdings/:id` | Удаление позиции |

Внешние API (MOEX, CoinGecko) могут лимитировать частоту запросов; на сервере кеш ~45 с.

## Продакшен

Полное обновление сайта на сервере (фронт + API + PM2) — из корня репозитория **`bash scripts/server-update.sh`**; если терминал уже в **`api/`** — **`bash update-all.sh`** (см. корневой **`README.md`**).

- Задайте **`JWT_SECRET`**, **`NODE_ENV=production`**, **`CORS_ORIGINS`** с вашим `https://домен`.
- **Сессия (cookie `rh_session`):** в коде **`maxAge` 30 дней** и **`SameSite=Lax`**. Если при каждом заходе снова просит войти — чаще всего открываешь сайт с **другого хоста**, чем при логине (например вошёл с **`www.`**, зашёл без него или наоборот): cookie привязана к хосту. Решение: в nginx **301 с одного варианта на другой** *или* в **`api/.env`** задать **`COOKIE_DOMAIN=.твой-домен.ru`** (точка в начале — для поддоменов), перезапустить API. По умолчанию при **`NODE_ENV=production`** cookie с флагом **`Secure`** — нужен **HTTPS**, иначе браузер не сохранит сессию; для HTTP в проде задайте **`COOKIE_SECURE=false`** в **`api/.env`**.
- БД: при росте можно перейти на PostgreSQL (смена `provider` в `schema.prisma`).
- Запуск: `npm run build && npm start` под **pm2** или **systemd**; **nginx** проксирует `location /api/` на порт API.

## Документация проекта

- Корень: **`README.md`**, **`CHANGELOG.md`**, **`ПАСПОРТ_ПРОЕКТА.md`**.
