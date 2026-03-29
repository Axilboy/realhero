/** Палитра для прототипа категорий */
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
] as const;

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
