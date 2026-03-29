/** Локальная дата YYYY-MM-DD из ISO-строки (календарный день пользователя). */
export function localYmdFromIso(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ymdToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ymdAddDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Подряд идущие календарные дни, начиная с `startYmd`, если для каждого дня есть дата в `dates`.
 */
export function consecutiveStreakFrom(dates: Set<string>, startYmd: string): number {
  if (!dates.has(startYmd)) return 0;
  let n = 0;
  let cur = startYmd;
  while (dates.has(cur)) {
    n += 1;
    cur = ymdAddDays(cur, -1);
  }
  return n;
}

/** Дни с завершённой тренировкой (по `completedAt`). */
export function workoutDatesFromCompleted(isoDates: (string | null | undefined)[]): Set<string> {
  const s = new Set<string>();
  for (const iso of isoDates) {
    if (!iso) continue;
    s.add(localYmdFromIso(iso));
  }
  return s;
}

/** Дни с записями замеров (`date` уже YYYY-MM-DD). */
export function measurementDateSet(ymdList: string[]): Set<string> {
  return new Set(ymdList.filter(Boolean));
}
