/** Mock API для v0.1 — имитация задержки сети. */

export type DashboardSnapshot = {
  greeting: string;
  level: number;
  expCurrent: number;
  expToNext: number;
  streakDays: number;
  highlights: string[];
  notifications: { id: string; text: string; tone: "info" | "warn" | "success" }[];
};

const snapshot: DashboardSnapshot = {
  greeting: "Добро пожаловать, герой",
  level: 1,
  expCurrent: 120,
  expToNext: 300,
  streakDays: 0,
  highlights: ["Центр — сводка дня и краткие подсказки по прогрессу."],
  notifications: [
    { id: "1", text: "Версия 0.1: каркас без бэкенда.", tone: "info" },
    { id: "2", text: "Добавьте привычки и квесты в следующих релизах.", tone: "success" },
  ],
};

export async function fetchDashboardSnapshot(): Promise<DashboardSnapshot> {
  await new Promise((r) => setTimeout(r, 280));
  return { ...snapshot };
}
