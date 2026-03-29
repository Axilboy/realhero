/**
 * Каталог пресет-квестов Real Hero (ветки).
 * Источник правды для сервера; клиент получает копию через GET /quests/definitions.
 */

export type QuestBranchId =
  | "tutorial"
  | "gym"
  | "health"
  | "beauty"
  | "books"
  | "cinema";

export type QuestStepType = "TASK";

export type QuestStepDef = {
  id: string;
  order: number;
  type: QuestStepType;
  title: string;
  note?: string;
  /** XP за завершение шага (для журнала геймификации). */
  rewardXp: number;
};

export type QuestDef = {
  id: string;
  branch: QuestBranchId;
  title: string;
  description: string;
  steps: QuestStepDef[];
};

export const QUEST_CATALOG: QuestDef[] = [
  {
    id: "tutorial-real-hero",
    branch: "tutorial",
    title: "Знакомство с Real Hero",
    description:
      "Короткий тур по вкладкам: герой, финансы, тело, задачи и действия — чтобы знать, где что лежит.",
    steps: [
      {
        id: "tour-01-hero",
        order: 0,
        type: "TASK",
        title: "Экран «Герой»: уровень, опыт и квесты",
        note:
          "Здесь уровень и полоса EXP, серии по телу, блок квестов. Внизу — переключатель вкладок; им вы и будете ходить по приложению.",
        rewardXp: 25,
      },
      {
        id: "tour-02-finance",
        order: 1,
        type: "TASK",
        title: "Вкладка «Финансы»",
        note:
          "Откройте «Финансы», пролистайте главную: карусель счетов, сводка за период. Внизу у модуля свои подвкладки — главная, инвестиции, аналитика, бюджет.",
        rewardXp: 25,
      },
      {
        id: "tour-03-body",
        order: 2,
        type: "TASK",
        title: "Вкладка «Тело»: замеры, питание, тренировки",
        note:
          "Откройте «Тело» и переключите три подвкладки: Замеры, Питание, Тренировки. Шестерёнка — единицы (кг/см) и цели КБЖУ.",
        rewardXp: 30,
      },
      {
        id: "tour-04-todo",
        order: 3,
        type: "TASK",
        title: "Вкладка «Задачи» и ручная задача",
        note:
          "Откройте «Задачи» и создайте одну свою задачу кнопкой добавления (не путайте с шагами квеста — нужна именно ручная). Так вы закрепите, где живут дела.",
        rewardXp: 30,
      },
      {
        id: "tour-05-actions",
        order: 4,
        type: "TASK",
        title: "Вкладка «Действия»",
        note:
          "Заготовка под привычки и отметки дня — позже свяжется с героем и телом. Достаточно открыть экран и прочитать вступление.",
        rewardXp: 20,
      },
      {
        id: "tour-06-header",
        order: 5,
        type: "TASK",
        title: "Шапка: аккаунт и язык",
        note:
          "Вверху — email, переключатель RU/EN и выход. Язык меняет подписи интерфейса.",
        rewardXp: 15,
      },
      {
        id: "tour-07-done",
        order: 6,
        type: "TASK",
        title: "Обучение пройдено",
        note:
          "Дальше — тематические квесты на «Герой» и реальные данные в «Тело» и «Финансы». Удачи!",
        rewardXp: 25,
      },
    ],
  },
  {
    id: "gym-foundation",
    branch: "gym",
    title: "Качалка: база",
    description:
      "Настроить питание по цифрам, зафиксировать старт и выйти на стабильные тренировки.",
    steps: [
      {
        id: "gym-01-bju",
        order: 0,
        type: "TASK",
        title: "Настроить цели КБЖУ в «Тело»",
        note: "Откройте настройки «Тело» и задайте калории и БЖУ под свой план.",
        rewardXp: 40,
      },
      {
        id: "gym-02-measure",
        order: 1,
        type: "TASK",
        title: "Сделать первый замер",
        note: "Вес и хотя бы один обхват или % жира — чтобы было от чего отталкиваться.",
        rewardXp: 40,
      },
      {
        id: "gym-03-workout",
        order: 2,
        type: "TASK",
        title: "Провести первую тренировку",
        note: "Запишите сессию в журнал тренировок (хотя бы одно упражнение).",
        rewardXp: 50,
      },
      {
        id: "gym-04-schedule",
        order: 3,
        type: "TASK",
        title: "Запланировать недельное расписание",
        note:
          "Определите дни и типы тренировок; можно в заметке к программе или в задачах.",
        rewardXp: 45,
      },
    ],
  },
  {
    id: "health-baseline",
    branch: "health",
    title: "Здоровье: сон и режим",
    description:
      "Мягко выровнять сон, воду и питание без перфекционизма — один шаг за раз.",
    steps: [
      {
        id: "hl-01-sleep-window",
        order: 0,
        type: "TASK",
        title: "Зафиксировать целевое окно сна",
        note: "Например: отбой 23:30 — подъём 07:30. Запишите в заметке задачи.",
        rewardXp: 35,
      },
      {
        id: "hl-02-hydration",
        order: 1,
        type: "TASK",
        title: "Задать дневную норму воды",
        note: "Ориентир по весу/активности; отметьте в задаче число стаканов или мл.",
        rewardXp: 30,
      },
      {
        id: "hl-03-meal-rhythm",
        order: 2,
        type: "TASK",
        title: "Три дня подряд — приёмы пищи в одно окно",
        note: "Не диета, а предсказуемый ритм (завтрак/обед/ужин ± час).",
        rewardXp: 45,
      },
      {
        id: "hl-04-evening",
        order: 3,
        type: "TASK",
        title: "Один вечер без стимуляторов после 16:00",
        note: "Кофе, энергетики, сильный чай — на ваш выбор, главное — отметить день.",
        rewardXp: 35,
      },
    ],
  },
  {
    id: "beauty-men-simple",
    branch: "beauty",
    title: "Красота: простой мужской минимум",
    description:
      "Базовый уход и порядок с внешностью без лишнего — умывание, кожа, волосы/борода.",
    steps: [
      {
        id: "b-01-morning",
        order: 0,
        type: "TASK",
        title: "Утро: умывание + уход",
        note: "Гель/пенка и при необходимости крем или SPF (если выходите на солнце).",
        rewardXp: 30,
      },
      {
        id: "b-02-evening-5",
        order: 1,
        type: "TASK",
        title: "5 вечеров за неделю — очищение",
        note: "Вечернее умывание/лосьон хотя бы 5 раз в течение 7 дней.",
        rewardXp: 40,
      },
      {
        id: "b-03-hair",
        order: 2,
        type: "TASK",
        title: "Стрижка или борода",
        note: "Запись к мастеру или аккуратная самостоятельная стрижка/подравнивание.",
        rewardXp: 45,
      },
      {
        id: "b-04-wardrobe",
        order: 3,
        type: "TASK",
        title: "Один комплект «на выход» без покупок",
        note: "Соберите из того, что есть: чисто, по размеру, без дыр и катышков.",
        rewardXp: 35,
      },
    ],
  },
  {
    id: "books-starter",
    branch: "books",
    title: "Книги: старт и направления",
    description:
      "Несколько треков чтения: художка, нон-фикшн и развитие навыка — с первыми шагами.",
    steps: [
      {
        id: "bk-01-tracks",
        order: 0,
        type: "TASK",
        title: "Три направления чтения",
        note: "Запишите: художественное, нон-фикшн, проф. рост/навык — по одному примеру.",
        rewardXp: 35,
      },
      {
        id: "bk-02-skill-book",
        order: 1,
        type: "TASK",
        title: "Первая книга по треку «навык»",
        note: "Купить, взять в библиотеке или открыть электронный экземпляр.",
        rewardXp: 40,
      },
      {
        id: "bk-03-sessions",
        order: 2,
        type: "TASK",
        title: "Четыре сессии по 30 минут",
        note: "В любой день; можно не подряд. Отметьте в дневнике/задачах.",
        rewardXp: 45,
      },
      {
        id: "bk-04-note",
        order: 3,
        type: "TASK",
        title: "Заметка: одна идея из книги",
        note: "Одно предложение своими словами — что примените на практике.",
        rewardXp: 40,
      },
    ],
  },
  {
    id: "cinema-explorer",
    branch: "cinema",
    title: "Киноман: база",
    description:
      "Watchlist, фильм с осмыслением и привычка «фильм недели».",
    steps: [
      {
        id: "c-01-watchlist",
        order: 0,
        type: "TASK",
        title: "Watchlist из 10 фильмов",
        note: "Смешайте жанры; можно в заметке задачи или отдельном списке.",
        rewardXp: 35,
      },
      {
        id: "c-02-one-done",
        order: 1,
        type: "TASK",
        title: "Один фильм из списка — просмотрен",
        note: "Коротко: что понравилось и что нет.",
        rewardXp: 40,
      },
      {
        id: "c-03-subtitles",
        order: 2,
        type: "TASK",
        title: "Фильм на языке оригинала с субтитрами",
        note: "Хотя бы один сеанс; не обязательно весь фильм за раз.",
        rewardXp: 40,
      },
      {
        id: "c-04-weekly",
        order: 3,
        type: "TASK",
        title: "Назначить «фильм недели»",
        note: "Выберите следующий фильм из списка и день просмотра в календаре.",
        rewardXp: 40,
      },
    ],
  },
];

const byId = new Map(QUEST_CATALOG.map((q) => [q.id, q]));

export function getQuestDefinition(questId: string): QuestDef | undefined {
  return byId.get(questId);
}

export function totalQuestRewardXp(def: QuestDef): number {
  return def.steps.reduce((s, x) => s + x.rewardXp, 0);
}
