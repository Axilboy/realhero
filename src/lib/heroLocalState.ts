const STORAGE_KEY = "rh_hero_game_v1";

export type HeroPersistedState = {
  /** Накопленный опыт (для уровня; источник правды позже — сервер). */
  totalExp: number;
};

function defaultState(): HeroPersistedState {
  return { totalExp: 0 };
}

export function loadHeroLocalState(): HeroPersistedState {
  if (typeof localStorage === "undefined") return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const p = JSON.parse(raw) as Partial<HeroPersistedState>;
    const totalExp =
      typeof p.totalExp === "number" && Number.isFinite(p.totalExp) && p.totalExp >= 0
        ? Math.floor(p.totalExp)
        : 0;
    return { totalExp };
  } catch {
    return defaultState();
  }
}

export function saveHeroLocalState(state: HeroPersistedState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

/** Уровень и прогресс: на уровень L нужно `100 * L` опыта, затем L+1. */
export function splitTotalExp(totalExp: number): {
  level: number;
  expInLevel: number;
  expToNext: number;
} {
  let level = 1;
  let xp = Math.max(0, Math.floor(totalExp));
  for (;;) {
    const need = 100 * level;
    if (xp < need) {
      return { level, expInLevel: xp, expToNext: need };
    }
    xp -= need;
    level += 1;
  }
}
