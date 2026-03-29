# PART-08: Данные и API (поведение UI)

Бэкенд: `api/`, префикс **`/api/v1/`**. Аутентификация: cookie-сессия + при необходимости Bearer. Ниже — что **ожидает UI**, без дублирования полной OpenAPI.

---

## 1. Герой и прогресс

| Действие | Метод | Путь | Примечание |
|----------|-------|------|------------|
| Получить EXP | GET | `/api/v1/hero` | `totalExp` |
| Синхронизация с клиента | POST | `/api/v1/hero/sync-from-local` | не понижать сервер |

Локальный кэш EXP в `localStorage` (см. `heroLocalState`) — при расхождении синхронизация.

---

## 2. Квесты

| Действие | Метод | Путь |
|----------|-------|------|
| Список определений | GET | `/api/v1/.../quest-definitions` (см. `questApi.ts`) |
| Экземпляры | GET | экземпляры квестов пользователя |
| Старт | POST | `startQuest` |
| Отказ | POST/PATCH | `abandonQuest` |

Точные пути — в `src/lib/questApi.ts`.

---

## 3. Финансы (обзор)

| Данные | Источник в коде |
|--------|-----------------|
| Счета и инвестиции | `fetchAccounts()` |
| Обзор инвестиций / метрики | `fetchInvestOverview()` |
| Настройки отчётов | `fetchFinanceSettings` / `patchFinanceSettings` |

Пассив на мини-карточке «Герой»: сумма `depositSavingsIncomeMonthMinor + couponDividendMonthMinor` при наличии.

---

## 4. Тело

| Данные | Функция API |
|--------|-------------|
| Настройки, цели КБЖУ | `fetchBodySettings`, `patchBodySettings` |
| День питания | `fetchNutritionDay(date)` |
| Замеры | `fetchMeasurements`, CRUD замеров |
| Тренировки | `fetchWorkouts`, создание/патч логов |
| Программы | `fetchPrograms`, CRUD по маршрутам |

Стрики на «Герой»: из `fetchWorkouts` + `fetchMeasurements` + утилиты дат в `heroStreaks.ts`.

---

## 5. Задачи

| Данные | Функция |
|--------|---------|
| Список | `fetchTasks` |

CRUD: `createTask`, `patchTask`, `deleteTask` — см. `todoApi.ts`.

---

## 6. Правила для макетов

- Не показывать поля, которых **нет** в ответе API.
- Суммы денег — в **копейках** на сервере, в UI форматирование **рубли** (`formatRubFromMinor`).
- Даты задач и замеров — строки **YYYY-MM-DD** в локальном смысле пользователя.

---

## 7. Ошибки

- Любой запрос может вернуть JSON с `error.message` — UI показывает строку пользователю.
- 401 → сброс сессии, редирект на лендинг/логин.
