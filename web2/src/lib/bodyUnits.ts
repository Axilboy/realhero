/** Хранение в API: кг и см. Отображение по настройкам. */

export type BodyMassUnit = "KG" | "LB";
export type BodyLengthUnit = "CM" | "IN";

export function kgToLb(kg: number): number {
  return kg * 2.2046226218;
}

export function lbToKg(lb: number): number {
  return lb / 2.2046226218;
}

export function cmToIn(cm: number): number {
  return cm / 2.54;
}

export function inToCm(inches: number): number {
  return inches * 2.54;
}

export function formatMass(kg: number | null | undefined, unit: BodyMassUnit): string {
  if (kg == null || !Number.isFinite(kg)) return "—";
  if (unit === "LB") {
    return `${kgToLb(kg).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} lb`;
  }
  return `${kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг`;
}

export function formatLength(
  cm: number | null | undefined,
  unit: BodyLengthUnit,
): string {
  if (cm == null || !Number.isFinite(cm)) return "—";
  if (unit === "IN") {
    return `${cmToIn(cm).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}″`;
  }
  return `${cm.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} см`;
}

export function parseMassInput(raw: string, unit: BodyMassUnit): number | null {
  const t = raw.trim().replace(/\s/g, "").replace(/,/g, ".");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return unit === "LB" ? lbToKg(n) : n;
}

export function parseLengthInput(raw: string, unit: BodyLengthUnit): number | null {
  const t = raw.trim().replace(/\s/g, "").replace(/,/g, ".");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return unit === "IN" ? inToCm(n) : n;
}
