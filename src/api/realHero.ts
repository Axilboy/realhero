import { apiUrl } from "../config/api";
import type {
  DashboardSnapshot,
  FinanceSummary,
  KanbanCardDto,
  QuestDto,
  TransactionDto,
} from "../types/dashboard";

async function parseError(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { error?: string };
    return j.error ?? `http_${r.status}`;
  } catch {
    return `http_${r.status}`;
  }
}

export async function fetchDashboard(): Promise<DashboardSnapshot> {
  const r = await fetch(apiUrl("/api/v1/dashboard"), { credentials: "include" });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error(await parseError(r));
  return (await r.json()) as DashboardSnapshot;
}

export async function fetchQuests(): Promise<QuestDto[]> {
  const r = await fetch(apiUrl("/api/v1/quests"), { credentials: "include" });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error(await parseError(r));
  const data = (await r.json()) as { quests: QuestDto[] };
  return data.quests;
}

export async function createQuest(body: {
  title: string;
  rewardExp?: number;
  rewardCoins?: number;
}): Promise<QuestDto> {
  const r = await fetch(apiUrl("/api/v1/quests"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error(await parseError(r));
  const data = (await r.json()) as { quest: QuestDto };
  return data.quest;
}

export type CompleteQuestResult = {
  ok: true;
  leveledUp: boolean;
  level: number;
  expInLevel: number;
  expToNext: number;
  coins: number;
  rewardExp: number;
  rewardCoins: number;
};

export async function completeQuest(id: string): Promise<CompleteQuestResult> {
  const r = await fetch(apiUrl(`/api/v1/quests/${encodeURIComponent(id)}/complete`), {
    method: "POST",
    credentials: "include",
  });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error(await parseError(r));
  return (await r.json()) as CompleteQuestResult;
}

export async function deleteQuest(id: string): Promise<void> {
  const r = await fetch(apiUrl(`/api/v1/quests/${encodeURIComponent(id)}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error(await parseError(r));
}

export async function updateQuest(
  id: string,
  body: { title?: string; rewardExp?: number; rewardCoins?: number }
): Promise<QuestDto> {
  const r = await fetch(apiUrl(`/api/v1/quests/${encodeURIComponent(id)}`), {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error(await parseError(r));
  const data = (await r.json()) as { quest: QuestDto };
  return data.quest;
}

export async function fetchTransactions(): Promise<TransactionDto[]> {
  const r = await fetch(apiUrl("/api/v1/finance/transactions?limit=100"), { credentials: "include" });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error(await parseError(r));
  const data = (await r.json()) as { transactions: TransactionDto[] };
  return data.transactions;
}

export async function fetchFinanceSummary(days = 30): Promise<FinanceSummary> {
  const r = await fetch(apiUrl(`/api/v1/finance/summary?days=${days}`), { credentials: "include" });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error(await parseError(r));
  return (await r.json()) as FinanceSummary;
}

export async function createTransaction(body: {
  type: "income" | "expense";
  amountMinor: number;
  category: string;
  note?: string | null;
}): Promise<TransactionDto> {
  const r = await fetch(apiUrl("/api/v1/finance/transactions"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error(await parseError(r));
  const data = (await r.json()) as { transaction: TransactionDto };
  return data.transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  const r = await fetch(apiUrl(`/api/v1/finance/transactions/${encodeURIComponent(id)}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error(await parseError(r));
}

export async function fetchKanbanCards(): Promise<KanbanCardDto[]> {
  const r = await fetch(apiUrl("/api/v1/kanban/cards"), { credentials: "include" });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error(await parseError(r));
  const data = (await r.json()) as { cards: KanbanCardDto[] };
  return data.cards;
}

export async function createKanbanCard(title: string, column?: KanbanCardDto["column"]): Promise<KanbanCardDto> {
  const r = await fetch(apiUrl("/api/v1/kanban/cards"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, column }),
  });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error(await parseError(r));
  const data = (await r.json()) as { card: KanbanCardDto };
  return data.card;
}

export async function moveKanbanCard(
  id: string,
  column: KanbanCardDto["column"]
): Promise<KanbanCardDto> {
  const r = await fetch(apiUrl(`/api/v1/kanban/cards/${encodeURIComponent(id)}`), {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ column }),
  });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error(await parseError(r));
  const data = (await r.json()) as { card: KanbanCardDto };
  return data.card;
}

export async function deleteKanbanCard(id: string): Promise<void> {
  const r = await fetch(apiUrl(`/api/v1/kanban/cards/${encodeURIComponent(id)}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error(await parseError(r));
}
