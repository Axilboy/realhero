/** EXP до следующего уровня: 100 × текущий уровень (ур.1 → 100, ур.2 → 200, …). */

export function expRequiredForLevel(level: number): number {
  return 100 * Math.max(1, level);
}

export function applyExpGain(
  level: number,
  expInLevel: number,
  expToNext: number,
  gain: number
): { level: number; expInLevel: number; expToNext: number; leveledUp: boolean } {
  let L = level;
  let e = expInLevel + gain;
  let need = expToNext;
  let leveledUp = false;
  while (e >= need) {
    e -= need;
    L += 1;
    need = expRequiredForLevel(L);
    leveledUp = true;
  }
  return { level: L, expInLevel: e, expToNext: need, leveledUp };
}
