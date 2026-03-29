import { apiFetch, errorMessage } from "./financeApi";

export { errorMessage };

export type QuestBranchId =
  | "tutorial"
  | "gym"
  | "health"
  | "beauty"
  | "books"
  | "cinema";

export type QuestDefinitionRow = {
  id: string;
  branch: QuestBranchId;
  title: string;
  description: string;
  stepCount: number;
  rewardXpTotal: number;
};

export type QuestInstanceRow = {
  id: string;
  questId: string;
  questTitle: string;
  branch: QuestBranchId | null;
  status: "ACTIVE" | "COMPLETED" | "ABANDONED";
  startedAt: string;
  completedAt: string | null;
  abandonedAt: string | null;
  stepsDone: number;
  stepsTotal: number;
};

async function j<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await apiFetch(path, init);
  const text = await res.text();
  let data = {} as T;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      if (!res.ok) {
        data = {
          error: {
            message:
              text.length > 200 ? `${text.slice(0, 200)}…` : text || res.statusText,
          },
        } as T;
      }
    }
  } else if (!res.ok) {
    data = { error: { message: res.statusText || `HTTP ${res.status}` } } as T;
  }
  return { ok: res.ok, status: res.status, data };
}

export async function fetchQuestDefinitions() {
  return j<{ quests: QuestDefinitionRow[] } | { error: { message: string } }>(
    "/api/v1/quests/definitions",
  );
}

export async function fetchQuestInstances() {
  return j<{ instances: QuestInstanceRow[] } | { error: { message: string } }>(
    "/api/v1/quests/instances",
  );
}

export async function startQuest(questId: string) {
  return j<
    | { instance: QuestInstanceRow }
    | { error: { message: string } }
  >("/api/v1/quests/instances", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questId }),
  });
}

export async function abandonQuest(instanceId: string) {
  return j<{ ok: true } | { error: { message: string } }>(
    `/api/v1/quests/instances/${encodeURIComponent(instanceId)}/abandon`,
    { method: "POST" },
  );
}
