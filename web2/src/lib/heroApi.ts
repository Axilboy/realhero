import { apiFetch, errorMessage } from "./financeApi";

export { errorMessage };

export type HeroStateResponse = {
  totalExp: number;
};

export type HeroSyncResponse = {
  totalExp: number;
  appliedDelta: number;
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

export async function fetchHero() {
  return j<HeroStateResponse | { error: { message: string } }>(
    "/api/v1/hero",
  );
}

export async function syncHeroFromLocal(totalExp: number) {
  return j<HeroSyncResponse | { error: { message: string } }>(
    "/api/v1/hero/sync-from-local",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totalExp }),
    },
  );
}
