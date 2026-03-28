export type DashboardSnapshot = {
  greeting: string;
  level: number;
  expCurrent: number;
  expToNext: number;
  streakDays: number;
  highlights: string[];
  notifications: { id: string; text: string; tone: "info" | "warn" | "success" }[];
};

export type QuestDto = {
  id: string;
  title: string;
  done: boolean;
  rewardExp: number;
  rewardCoins: number;
  createdAt: string;
  completedAt: string | null;
};
