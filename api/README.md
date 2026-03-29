# Real Hero — API

Бэкенд приложения **Real Hero**: аутентификация по **email + паролю** (без подтверждения почты), персональный **финансовый** модуль (счета, операции, инвестиции, бюджет, котировки), модуль **«Тело»** (замеры, питание, тренировки) и модуль **«Задачи»** (`UserTask`, сроки, задел под квесты).

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

Префиксы API: **`/api/v1/finance/`**, **`/api/v1/body/`**, **`/api/v1/tasks`** (ниже пути относительно префикса модуля, если не указано иное).

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
| DELETE | `/accounts/:id` | Удалить **пустой** счёт (без операций и переводов) |
| POST | `/accounts/:id/merge-into` | Тело `{ "targetAccountId" }` — перенести все операции и переводы на другой счёт и удалить исходный (для счетов с историей) |
| POST | `/accounts/:id/purge` | Удалить счёт и все связанные операции и переводы без переноса (остаток в учёте исчезает) |
| POST | `/transfers` | Перевод между счетами |
| GET | `/categories` | Категории (`?includeArchived=1` — с архивными) |
| POST | `/categories` | Новая категория |
| PATCH | `/categories/:id` | Изменить / архив |
| GET | `/transactions` | Операции (`?from=&to=` ISO; `?accountId=` — фильтр по счёту; без дат — последние 60 дней, с `accountId` — 365) |
| POST | `/transactions` | Расход или доход |
| PATCH | `/transactions/:id` | Правка операции |
| DELETE | `/transactions/:id` | Удаление |
| GET | `/summary` | Сводка за **календарный** месяц `?month=YYYY-MM` |
| GET | `/summary/by-category` | Расходы/доходы по категориям за календарный месяц |
| GET | `/settings` | Отчётность: `financeReportingDay` (1–28), `financeReportingGranularity`: `DAY` \| `WEEK` \| `MONTH` \| `YEAR` \| `CUSTOM`, опционально `financeReportingCustomFrom` / `financeReportingCustomTo` (YYYY-MM-DD); флаги доходности на карточках счёта: `financeCardShowYieldDay` … `financeCardShowYieldYear` |
| PATCH | `/settings` | То же поля, что отдаёт GET (частичное обновление) |
| GET | `/budget` | Лимиты по категориям за календарный месяц `?month=YYYY-MM`; факт расходов по категориям |
| GET | `/budget/summary` | Сводка по бюджету за месяц (для главного экрана) |
| PUT | `/budget` | Тело: `{ "month": "YYYY-MM", "limits": [ { "categoryId", "limitMinor" } ] }` — сохранить лимиты на месяц |
| GET | `/summary/reporting` | Сводка за окно отчётности по настройке; опционально `?from=YYYY-MM-DD&to=YYYY-MM-DD` (свой диапазон, UTC-дни) |
| GET | `/analytics/reporting-forecast` | Прогноз к концу периода; те же query `from`/`to`, что и у `summary/reporting` |
| GET | `/investments/overview` | Портфель, метрики, **`allocation`** (структура счётов и инвестиций). **`?refresh=1`** — обновить цены по сохранённым котировкам |
| GET | `/investments/quote-search` | Поиск: `?q=` (≥2 символа), MOEX + CoinGecko |
| GET | `/investments/quote-price` | `source`, `id`, опционально `date`, `moexMarket` — цена в ₽ |
| GET | `/investments/quote-fundamentals` | `source`, `id`, `assetKind`, опционально `moexMarket` — оценка **₽/год с одной бумаги** (купон/дивиденды MOEX) |
| POST | `/investments/holdings` | Новая позиция (в т.ч. `quote*`, `annualIncomePerUnitRub`, legacy `annualCouponDividendRub`) |
| PATCH | `/investments/holdings/:id` | Правка позиции |
| DELETE | `/investments/holdings/:id` | Удаление позиции |

Внешние API (MOEX, CoinGecko) могут лимитировать частоту запросов; на сервере кеш ~45 с.

### Тело (нужна сессия)

Все маршруты ниже — **`/api/v1/body/...`**. В БД масса и длина замеров хранятся в **кг и см**; единицы отображения задаются в настройках пользователя.

| Метод | Путь | Описание |
|--------|------|-----------|
| GET | `/settings` | Единицы: `bodyMassUnit` (KG \| LB), `bodyLengthUnit` (CM \| IN); цели: `bodyKcalGoal`, `bodyProteinGoalG`, `bodyFatGoalG`, `bodyCarbGoalG` |
| PATCH | `/settings` | Частичное обновление полей из GET |
| GET | `/measurements` | Список замеров |
| POST | `/measurements` | Новая запись (дата YYYY-MM-DD, вес/рост/% жира/обхваты в кг и см) |
| PATCH | `/measurements/:id` | Правка |
| DELETE | `/measurements/:id` | Удаление |
| GET | `/nutrition/day/:date` | Питание за день `date` (YYYY-MM-DD) |
| POST | `/nutrition/entries` | Строка питания (приём пищи, блюдо, ккал, БЖУ) |
| PATCH | `/nutrition/entries/:id` | Правка |
| DELETE | `/nutrition/entries/:id` | Удаление |
| GET | `/programs` | Список программ тренировок |
| POST | `/programs` | Новая программа |
| GET | `/programs/:id` | Программа с днями и упражнениями |
| PATCH | `/programs/:id` | Правка программы |
| DELETE | `/programs/:id` | Удаление |
| POST | `/programs/:id/days` | Добавить день в цикле |
| PATCH | `/training-days/:id` | Правка дня |
| DELETE | `/training-days/:id` | Удаление дня |
| POST | `/training-days/:id/exercises` | Упражнение в дне |
| PATCH | `/training-exercises/:id` | Правка упражнения |
| DELETE | `/training-exercises/:id` | Удаление упражнения |
| GET | `/workouts` | Журнал тренировок |
| POST | `/workouts` | Начать запись тренировки |
| PATCH | `/workouts/:id` | Правка журнала |
| POST | `/workouts/:id/lines` | Строка результата (`resultJson` и пр.) |
| GET | `/workouts/:id` | Одна тренировка с линиями |

### Задачи (нужна сессия)

Маршруты ниже — **`/api/v1/tasks`** (без дополнительного префикса в пути: `GET /api/v1/tasks`).

| Метод | Путь | Описание |
|--------|------|-----------|
| GET | `/tasks` | Список задач. Query: `completed` = `active` \| `done` \| `all` (по умолчанию `active` — только невыполненные) |
| POST | `/tasks` | Создать задачу: `title`, опционально `note`, `dueDate` (YYYY-MM-DD), `dueTime` (HH:mm). Ручное создание с `source: QUEST` запрещено |
| PATCH | `/tasks/:id` | Частичное обновление; `completed: true` \| `false` — отметка выполнения |
| DELETE | `/tasks/:id` | Удаление (204) |

## Продакшен

Полное обновление сайта на сервере (фронт + API + PM2) — из корня репозитория **`bash scripts/server-update.sh`**; если терминал уже в **`api/`** — **`bash update-all.sh`** (см. корневой **`README.md`**).

- Задайте **`JWT_SECRET`**, **`NODE_ENV=production`**, **`CORS_ORIGINS`** с вашим `https://домен`.
- **Сессия (cookie `rh_session`):** в коде **`maxAge` 30 дней** и **`SameSite=Lax`**. Если при каждом заходе снова просит войти — чаще всего открываешь сайт с **другого хоста**, чем при логине (например вошёл с **`www.`**, зашёл без него или наоборот): cookie привязана к хосту. Решение: в nginx **301 с одного варианта на другой** *или* в **`api/.env`** задать **`COOKIE_DOMAIN=.твой-домен.ru`** (точка в начале — для поддоменов), перезапустить API. По умолчанию при **`NODE_ENV=production`** cookie с флагом **`Secure`** — нужен **HTTPS**, иначе браузер не сохранит сессию; для HTTP в проде задайте **`COOKIE_SECURE=false`** в **`api/.env`**.
- БД: при росте можно перейти на PostgreSQL (смена `provider` в `schema.prisma`).
- Запуск: `npm run build && npm start` под **pm2** или **systemd**; **nginx** проксирует `location /api/` на порт API.

## Документация проекта

- Корень: **`README.md`**, **`CHANGELOG.md`**, **`ПАСПОРТ_ПРОЕКТА.md`**.
