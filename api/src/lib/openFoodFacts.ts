/** Прокси к Open Food Facts (данные на 100 г). */

const OFF_UA = "RealHero/1.0 (https://github.com/realhero)";

export type OffNutrition100 = {
  name: string;
  brand: string | null;
  kcal100: number;
  protein100: number;
  fat100: number;
  carb100: number;
  code: string | null;
};

function nutriments100(n: Record<string, unknown> | undefined | null): {
  kcal100: number;
  protein100: number;
  fat100: number;
  carb100: number;
} {
  if (!n || typeof n !== "object") {
    return { kcal100: 0, protein100: 0, fat100: 0, carb100: 0 };
  }
  const kj = num(n["energy-kj_100g"]) ?? num(n.energy_kj_100g);
  const kcal =
    num(n["energy-kcal_100g"]) ??
    num(n.energy_kcal_100g) ??
    (kj != null ? Math.round(kj / 4.184) : 0);
  return {
    kcal100: Math.max(0, Math.round(kcal)),
    protein100: Math.max(0, num(n.proteins_100g) ?? 0),
    fat100: Math.max(0, num(n.fat_100g) ?? 0),
    carb100: Math.max(0, num(n.carbohydrates_100g) ?? 0),
  };
}

function num(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "") {
    const v = Number(x.replace(",", "."));
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

function pickName(p: Record<string, unknown>): string {
  const a = p.product_name;
  if (typeof a === "string" && a.trim()) return a.trim().slice(0, 200);
  const b = p.product_name_en;
  if (typeof b === "string" && b.trim()) return b.trim().slice(0, 200);
  return "Продукт";
}

export async function fetchOffProductByCode(
  code: string,
): Promise<OffNutrition100 | null> {
  const clean = code.replace(/\D/g, "");
  if (clean.length < 8) return null;
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(clean)}.json`;
  const res = await fetch(url, { headers: { "User-Agent": OFF_UA } });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    status?: number;
    product?: Record<string, unknown>;
  };
  if (data.status !== 1 || !data.product) return null;
  const p = data.product;
  const nut = nutriments100(p.nutriments as Record<string, unknown>);
  const brands = p.brands;
  return {
    name: pickName(p),
    brand: typeof brands === "string" && brands.trim() ? brands.trim() : null,
    ...nut,
    code: clean,
  };
}

export async function searchOffProducts(
  q: string,
  pageSize = 12,
): Promise<OffNutrition100[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.searchParams.set("search_terms", query);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "true");
  url.searchParams.set("page_size", String(Math.min(24, pageSize)));
  const res = await fetch(url.toString(), { headers: { "User-Agent": OFF_UA } });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    products?: Record<string, unknown>[];
  };
  const products = data.products ?? [];
  const out: OffNutrition100[] = [];
  for (const raw of products) {
    const p = raw as Record<string, unknown>;
    const nut = nutriments100(p.nutriments as Record<string, unknown>);
    if (nut.kcal100 === 0 && nut.protein100 === 0 && nut.fat100 === 0 && nut.carb100 === 0) {
      continue;
    }
    const codeRaw = p.code;
    const code =
      typeof codeRaw === "string" || typeof codeRaw === "number"
        ? String(codeRaw).replace(/\D/g, "") || null
        : null;
    const brands = p.brands;
    out.push({
      name: pickName(p),
      brand: typeof brands === "string" && brands.trim() ? brands.trim() : null,
      ...nut,
      code,
    });
    if (out.length >= pageSize) break;
  }
  return out;
}
