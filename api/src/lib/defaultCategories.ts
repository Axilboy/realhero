import type { CategoryType } from "@prisma/client";

type SeedCat = { name: string; type: CategoryType; sortOrder: number };

/** Встроенные категории копируются для каждого нового пользователя. */
export const DEFAULT_CATEGORIES: SeedCat[] = [
  { name: "Продукты", type: "EXPENSE", sortOrder: 0 },
  { name: "Транспорт", type: "EXPENSE", sortOrder: 1 },
  { name: "Жильё", type: "EXPENSE", sortOrder: 2 },
  { name: "Развлечения", type: "EXPENSE", sortOrder: 3 },
  { name: "Здоровье", type: "EXPENSE", sortOrder: 4 },
  { name: "Одежда", type: "EXPENSE", sortOrder: 5 },
  { name: "Связь", type: "EXPENSE", sortOrder: 6 },
  { name: "Подписки", type: "EXPENSE", sortOrder: 7 },
  { name: "Рестораны", type: "EXPENSE", sortOrder: 8 },
  { name: "Прочие расходы", type: "EXPENSE", sortOrder: 9 },
  { name: "Зарплата", type: "INCOME", sortOrder: 0 },
  { name: "Подработка", type: "INCOME", sortOrder: 1 },
  { name: "Проценты", type: "INCOME", sortOrder: 2 },
  { name: "Кэшбэк", type: "INCOME", sortOrder: 3 },
  { name: "Подарки / переводы", type: "INCOME", sortOrder: 4 },
  { name: "Прочие доходы", type: "INCOME", sortOrder: 5 },
  { name: "Универсальная", type: "BOTH", sortOrder: 0 },
];
