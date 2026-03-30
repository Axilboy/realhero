/** Палитра для категорий (иконка + акцент). */
export const CATEGORY_COLOR_PRESETS = [
  "#e8b923",
  "#ea4335",
  "#4285f4",
  "#34a853",
  "#9c27b0",
  "#ff6d00",
  "#00bcd4",
  "#795548",
  "#ab47bc",
  "#26a69a",
  "#e91e63",
  "#cddc39",
  "#ff5252",
  "#7c4dff",
  "#00e676",
  "#ffab00",
  "#40c4ff",
  "#d4a574",
  "#5c6bc0",
] as const;

/** Цветные эмодзи (рендер ОС); рамка кнопки подкрашивается из палитры по индексу. */
export const CATEGORY_EMOJI_PRESETS = [
  "🐷",
  "🍕",
  "🛒",
  "🚗",
  "🏠",
  "☕",
  "💊",
  "🎁",
  "✈️",
  "📱",
  "💳",
  "💰",
  "📈",
  "🍔",
  "🥛",
  "🎮",
  "🐱",
  "⚡",
  "🌙",
  "🥑",
  "🍜",
  "🥤",
  "🎬",
  "📚",
  "🎸",
  "🏋️",
  "🧘",
  "🐕",
  "🌿",
  "🌸",
  "🎄",
  "🎂",
  "💼",
  "🔧",
  "🛠️",
  "🧾",
  "🎟️",
  "⛽",
  "🚲",
  "🛍️",
  "💡",
  "🧴",
  "👶",
  "🎓",
  "🌍",
  "🍀",
  "🥂",
  "🎯",
  "🎰",
  "🧸",
  "📦",
] as const;

export function defaultEmojiForName(name: string): string {
  const n = name.trim().toLowerCase();
  if (/продукт|еда|магазин/i.test(n)) return "🛒";
  if (/транспорт|авто|бензин/i.test(n)) return "🚗";
  if (/жкх|связь|интернет/i.test(n)) return "🏠";
  if (/здоров|аптек/i.test(n)) return "💊";
  if (/зарплат|доход/i.test(n)) return "💰";
  return "🐷";
}

export function defaultColorForIndex(i: number): string {
  return CATEGORY_COLOR_PRESETS[i % CATEGORY_COLOR_PRESETS.length]!;
}

/** Цвет рамки для пресета эмодзи по индексу (разноцветная сетка выбора). */
export function tintColorForEmojiIndex(i: number): string {
  return CATEGORY_COLOR_PRESETS[i % CATEGORY_COLOR_PRESETS.length]!;
}
