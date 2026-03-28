import { apiUrl } from "../config/api";
import type { DashboardSnapshot, QuestDto } from "../types/dashboard";

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
