import type { CategoryType } from "@prisma/client";

type SeedCat = {
  name: string;
  type: CategoryType;
  sortOrder: number;
  excludeFromReporting?: boolean;
};

/**
 * Набор как у популярных учётчиков (ZenMoney, CoinKeeper и др.): еда, транспорт,
 * жильё/связь, здоровье, подписки, налоги и т.д.; доходы — зарплата, подработка,
 * кэшбэк, проценты…
 */
export const DEFAULT_CATEGORIES: SeedCat[] = [
  { name: "Продукты и супермаркеты", type: "EXPENSE", sortOrder: 0 },
  { name: "Транспорт", type: "EXPENSE", sortOrder: 1 },
  { name: "Автомобиль", type: "EXPENSE", sortOrder: 2 },
  { name: "ЖКХ, связь и интернет", type: "EXPENSE", sortOrder: 3 },
  { name: "Рестораны и кафе", type: "EXPENSE", sortOrder: 4 },
  { name: "Развлечения", type: "EXPENSE", sortOrder: 5 },
  { name: "Здоровье и аптеки", type: "EXPENSE", sortOrder: 6 },
  { name: "Одежда и обувь", type: "EXPENSE", sortOrder: 7 },
  { name: "Красота и уход", type: "EXPENSE", sortOrder: 8 },
  { name: "Образование", type: "EXPENSE", sortOrder: 9 },
  { name: "Дети", type: "EXPENSE", sortOrder: 10 },
  { name: "Подарки", type: "EXPENSE", sortOrder: 11 },
  { name: "Путешествия", type: "EXPENSE", sortOrder: 12 },
  { name: "Подписки и сервисы", type: "EXPENSE", sortOrder: 13 },
  { name: "Налоги и сборы", type: "EXPENSE", sortOrder: 14 },
  { name: "Животные", type: "EXPENSE", sortOrder: 15 },
  { name: "Ремонт и быт", type: "EXPENSE", sortOrder: 16 },
  { name: "Прочие расходы", type: "EXPENSE", sortOrder: 17 },

  { name: "Зарплата", type: "INCOME", sortOrder: 0 },
  { name: "Бизнес и подработка", type: "INCOME", sortOrder: 1 },
  { name: "Подарки и переводы", type: "INCOME", sortOrder: 2 },
  { name: "Возвраты и кэшбэк", type: "INCOME", sortOrder: 3 },
  { name: "Проценты и дивиденды", type: "INCOME", sortOrder: 4 },
  { name: "Продажа имущества", type: "INCOME", sortOrder: 5 },
  { name: "Аренда (сдача)", type: "INCOME", sortOrder: 6 },
  { name: "Прочие доходы", type: "INCOME", sortOrder: 7 },

  { name: "Универсальная", type: "BOTH", sortOrder: 0 },
  {
    name: "Корректировка баланса",
    type: "BOTH",
    sortOrder: 1,
    excludeFromReporting: true,
  },
];

export const BALANCE_ADJUSTMENT_CATEGORY_NAME = "Корректировка баланса";
