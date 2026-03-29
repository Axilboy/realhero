import { apiFetch, errorMessage } from "./financeApi";

export { errorMessage };

export type TaskSource = "MANUAL" | "QUEST";

export type UserTaskRow = {
  id: string;
  userId: string;
  title: string;
  note: string | null;
  dueDate: string | null;
  dueTime: string | null;
  completedAt: string | null;
  sortOrder: number;
  source: TaskSource;
  questInstanceId: string | null;
  questStepId: string | null;
  createdAt: string;
  updatedAt: string;
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

export async function fetchTasks(completed: "active" | "done" | "all") {
  const q = new URLSearchParams({ completed });
  return j<{ tasks: UserTaskRow[] }>(`/api/v1/tasks?${q.toString()}`);
}

export async function createTask(payload: {
  title: string;
  note?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
}) {
  return j<{ task: UserTaskRow }>("/api/v1/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchTask(
  id: string,
  payload: {
    title?: string;
    note?: string | null;
    dueDate?: string | null;
    dueTime?: string | null;
    sortOrder?: number;
    completed?: boolean;
  },
) {
  return j<{ task: UserTaskRow }>(`/api/v1/tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteTask(id: string) {
  const res = await apiFetch(
    `/api/v1/tasks/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (res.ok) {
    return { ok: true as const, status: res.status, data: {} as Record<string, never> };
  }
  const text = await res.text();
  let data: { error?: { message?: string } } = {};
  if (text) {
    try {
      data = JSON.parse(text) as { error?: { message?: string } };
    } catch {
      data = { error: { message: text.slice(0, 200) } };
    }
  }
  return { ok: false, status: res.status, data };
}
