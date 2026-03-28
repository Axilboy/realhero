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

export type TransactionDto = {
  id: string;
  amountMinor: number;
  type: "income" | "expense";
  category: string;
  note: string | null;
  occurredAt: string;
  createdAt: string;
};

export type FinanceSummary = {
  periodDays: number;
  totalIncomeMinor: number;
  totalExpenseMinor: number;
  balanceMinor: number;
  byCategory: Record<string, number>;
};

export type KanbanCardDto = {
  id: string;
  title: string;
  column: "todo" | "doing" | "done";
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};
