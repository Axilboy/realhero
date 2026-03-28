import type { InvestmentAssetKind } from "@prisma/client";

export type QuoteSearchHit = {
  source: "coingecko" | "moex";
  externalId: string;
  name: string;
  symbol: string;
  assetKind: InvestmentAssetKind;
  /** Для котировки MOEX: где искать цену. */
  moexMarket?: "shares" | "bonds";
};

const UA = "RealHeroFinance/1.0";
const TIMEOUT_MS = 12_000;
const CACHE_MS = 45_000;

const cache = new Map<string, { at: number; data: unknown }>();

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url}`);
  }
  return res.json() as Promise<T>;
}

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return Promise.resolve(hit.data as T);
  }
  return fn().then((data) => {
    cache.set(key, { at: Date.now(), data });
    return data;
  });
}

function issRows(
  block: { columns?: string[]; data?: unknown[][] } | undefined,
): Record<string, unknown>[] {
  if (!block?.columns || !block.data) return [];
  const cols = block.columns.map((c) => String(c).toLowerCase());
  return block.data.map((row) => {
    const o: Record<string, unknown> = {};
    cols.forEach((c, i) => {
      o[c] = row[i];
    });
    return o;
  });
}

function moexRowAssetKindAndMarket(
  r: Record<string, unknown>,
): { assetKind: InvestmentAssetKind; moexMarket: "shares" | "bonds" } {
  const t = String(
    r.type ?? r.typename ?? r.instrtype ?? r.grouptype ?? "",
  ).toLowerCase();
  const sn = String(r.shortname ?? r.name ?? "");
  const bondHints =
    t.includes("bond") ||
    t.includes("облига") ||
    t.includes("ofz") ||
    t.includes("корп") ||
    /\d{3}[Pp]-/.test(sn) ||
    /\bофз\b/i.test(sn);
  if (bondHints) return { assetKind: "BOND", moexMarket: "bonds" };
  if (t.includes("share") || t.includes("акци")) {
    return { assetKind: "STOCK", moexMarket: "shares" };
  }
  if (t.includes("pif") || t.includes("фонд") || t.includes("etf")) {
    return { assetKind: "FUND", moexMarket: "shares" };
  }
  return { assetKind: "STOCK", moexMarket: "shares" };
}

function moexPickRow(
  rows: Record<string, unknown>[],
  sid: string,
): Record<string, unknown> | undefined {
  const u = sid.toUpperCase();
  return rows.find((r) => String(r.secid ?? "").toUpperCase() === u) ?? rows[0];
}

function moexNumericPrice(pick: Record<string, unknown>): number | null {
  const keys = [
    "last",
    "prevprice",
    "currentprice",
    "marketprice",
    "marketprice2",
    "waprice",
    "close",
    "legalcloseprice",
  ];
  for (const k of keys) {
    const v = pick[k];
    if (v == null || v === "") continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

async function searchCoinGecko(q: string): Promise<QuoteSearchHit[]> {
  const j = await cached(`cg:search:${q}`, () =>
    getJson<{
      coins?: { id: string; name: string; symbol: string }[];
    }>(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`,
    ),
  );
  const coins = j.coins ?? [];
  return coins.slice(0, 12).map((c) => ({
    source: "coingecko" as const,
    externalId: c.id,
    name: c.name,
    symbol: String(c.symbol).toUpperCase(),
    assetKind: "CRYPTO" as const,
  }));
}

async function searchMoex(q: string): Promise<QuoteSearchHit[]> {
  const j = await cached(`moex:sec:${q}`, () =>
    getJson<{
      securities?: { columns?: string[]; data?: unknown[][] };
    }>(
      `https://iss.moex.com/iss/securities.json?q=${encodeURIComponent(q)}&limit=15&iss.meta=off`,
    ),
  );
  const rows = issRows(j.securities);
  const out: QuoteSearchHit[] = [];
  for (const r of rows) {
    const secid = r.secid;
    const sid = typeof secid === "string" ? secid.trim().toUpperCase() : "";
    if (!sid || !/^[A-Z0-9.-]{2,24}$/i.test(sid)) continue;
    const shortname = String(r.shortname ?? sid);
    const name = String(r.secname ?? r.name ?? shortname);
    const { assetKind, moexMarket } = moexRowAssetKindAndMarket(r);
    out.push({
      source: "moex",
      externalId: sid,
      name: name.length > 120 ? name.slice(0, 117) + "…" : name,
      symbol: sid,
      assetKind,
      moexMarket,
    });
    if (out.length >= 10) break;
  }
  return out;
}

export async function searchInvestQuotes(query: string): Promise<QuoteSearchHit[]> {
  const q = query.trim();
  const [cg, mx] = await Promise.all([
    searchCoinGecko(q).catch(() => [] as QuoteSearchHit[]),
    searchMoex(q).catch(() => [] as QuoteSearchHit[]),
  ]);
  return [...mx, ...cg];
}

function toCoinGeckoHistoryDate(isoYmd: string): string {
  const [y, m, d] = isoYmd.split("-");
  if (!y || !m || !d) throw new Error("bad date");
  return `${d}-${m}-${y}`;
}

async function priceCoinGeckoRub(
  id: string,
  dateYmd: string | undefined,
): Promise<{ priceRub: number; asOf: string | null }> {
  if (!/^[a-z0-9-]{1,80}$/.test(id)) {
    throw new Error("invalid coingecko id");
  }
  if (dateYmd) {
    const cgDate = toCoinGeckoHistoryDate(dateYmd);
    const j = await cached(`cg:hist:${id}:${dateYmd}`, () =>
      getJson<{
        market_data?: { current_price?: Record<string, number> };
      }>(
        `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/history?date=${encodeURIComponent(cgDate)}`,
      ),
    );
    const rub = j.market_data?.current_price?.rub;
    if (typeof rub === "number" && rub > 0) {
      return { priceRub: rub, asOf: dateYmd };
    }
    const usd = j.market_data?.current_price?.usd;
    if (typeof usd === "number" && usd > 0) {
      const fx = await cached(`cg:usd-rub`, () =>
        getJson<Record<string, { rub?: number }>>(
          "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=rub",
        ),
      );
      const rubPerUsd = fx.tether?.rub;
      if (typeof rubPerUsd === "number" && rubPerUsd > 0) {
        return { priceRub: usd * rubPerUsd, asOf: dateYmd };
      }
    }
    throw new Error("no price in rub for date");
  }
  const j = await cached(`cg:now:${id}`, () =>
    getJson<Record<string, { rub?: number }>>(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=rub`,
    ),
  );
  const rub = j[id]?.rub;
  if (typeof rub !== "number" || rub <= 0) {
    throw new Error("no current rub price");
  }
  return { priceRub: rub, asOf: null };
}

async function moexHistoryClose(
  sid: string,
  dateYmd: string,
): Promise<{ num: number; note: string } | null> {
  const enc = encodeURIComponent(sid);
  const tryUrls = [
    `https://iss.moex.com/iss/history/engines/stock/markets/shares/boards/TQBR/securities/${enc}.json?from=${dateYmd}&till=${dateYmd}&iss.meta=off`,
    `https://iss.moex.com/iss/history/engines/stock/markets/shares/securities/${enc}.json?from=${dateYmd}&till=${dateYmd}&iss.meta=off`,
    `https://iss.moex.com/iss/history/engines/stock/markets/bonds/boards/TQCB/securities/${enc}.json?from=${dateYmd}&till=${dateYmd}&iss.meta=off`,
    `https://iss.moex.com/iss/history/engines/stock/markets/bonds/securities/${enc}.json?from=${dateYmd}&till=${dateYmd}&iss.meta=off`,
  ];
  for (const u of tryUrls) {
    const j = await cached(`moex:hist:${sid}:${dateYmd}:${u}`, () =>
      getJson<{ history?: { columns?: string[]; data?: unknown[][] } }>(u),
    );
    const rows = issRows(j.history);
    if (!rows.length) continue;
    const row =
      rows.find((r) => {
        const b = String(r.boardid ?? "").toUpperCase();
        return b === "TQBR" || b === "TQCB" || b === "TQOB" || b === "TQOD";
      }) ?? rows[0];
    const num = moexNumericPrice(row);
    if (num != null) {
      return {
        num,
        note: "MOEX, цена закрытия (₽)",
      };
    }
  }
  return null;
}

async function moexCurrentPrice(
  sid: string,
  preferred: "shares" | "bonds" | "auto",
): Promise<{ priceRub: number; note: string }> {
  const order: ("shares" | "bonds")[] =
    preferred === "auto"
      ? ["shares", "bonds"]
      : preferred === "bonds"
        ? ["bonds", "shares"]
        : ["shares", "bonds"];

  let lastErr: Error | null = null;
  for (const market of order) {
    try {
      const url = `https://iss.moex.com/iss/engines/stock/markets/${market}/securities/${encodeURIComponent(sid)}.json?iss.meta=off`;
      const j = await cached(`moex:md:${market}:${sid}`, () =>
        getJson<{ marketdata?: { columns?: string[]; data?: unknown[][] } }>(
          url,
        ),
      );
      const rows = issRows(j.marketdata);
      const pick = moexPickRow(rows, sid);
      if (!pick) continue;
      const raw = moexNumericPrice(pick);
      if (raw != null) {
        const label = market === "bonds" ? "облигации" : "акции";
        return {
          priceRub: raw,
          note: `MOEX (${label}), последняя или закрытие`,
        };
      }
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  if (lastErr) throw lastErr;
  throw new Error("no moex price");
}

async function priceMoexRub(
  secid: string,
  dateYmd: string | undefined,
  preferredMarket: "shares" | "bonds" | "auto",
): Promise<{ priceRub: number; asOf: string | null; note?: string }> {
  const sid = secid.trim().toUpperCase();
  if (!/^[A-Z0-9.-]{2,24}$/i.test(sid)) {
    throw new Error("invalid moex secid");
  }
  if (dateYmd) {
    const h = await moexHistoryClose(sid, dateYmd);
    if (!h) throw new Error("no history price");
    return { priceRub: h.num, asOf: dateYmd, note: h.note };
  }
  const cur = await moexCurrentPrice(sid, preferredMarket);
  return {
    priceRub: cur.priceRub,
    asOf: null,
    note: cur.note,
  };
}

export async function fetchQuotePriceRub(
  source: "coingecko" | "moex",
  id: string,
  dateYmd?: string,
  moexPreferredMarket?: "shares" | "bonds" | "auto",
): Promise<{ priceRub: number; asOf: string | null; note?: string }> {
  if (source === "coingecko") {
    return priceCoinGeckoRub(id, dateYmd);
  }
  const pref = moexPreferredMarket ?? "auto";
  return priceMoexRub(id, dateYmd, pref);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

/** Сумма дивидендов на акцию за последние ~12 мес. (₽). */
export async function moexDividendsLastYearSumRubPerShare(
  secid: string,
): Promise<number | null> {
  const sid = secid.trim().toUpperCase();
  const j = await cached(`moex:divsum:${sid}`, () =>
    getJson<{ dividends?: { columns?: string[]; data?: unknown[][] } }>(
      `https://iss.moex.com/iss/securities/${encodeURIComponent(sid)}/dividends.json?iss.meta=off`,
    ),
  );
  const rows = issRows(j.dividends);
  const cut = daysAgo(370);
  let sum = 0;
  for (const r of rows) {
    const ds = r.registryclosedate;
    if (!ds) continue;
    const dt = new Date(String(ds).slice(0, 10));
    if (Number.isNaN(dt.getTime()) || dt < cut) continue;
    const v = r.value;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) sum += n;
  }
  return sum > 0 ? Math.round(sum * 100) / 100 : null;
}

function couponPaymentRub(row: Record<string, unknown>): number {
  const vr = row.value_rub;
  if (vr != null && vr !== "") {
    const n = typeof vr === "number" ? vr : Number(vr);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const v = row.value;
  if (v != null && v !== "") {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const vp = Number(row.valueprc ?? 0);
  const fv = Number(row.facevalue ?? row.initialfacevalue ?? 0);
  if (vp > 0 && fv > 0) return (vp / 100) * fv;
  return 0;
}

/** Оценка годового купона в ₽ с одной облигации (по данным MOEX). */
export async function moexBondAnnualCouponRubPerUnit(
  secid: string,
): Promise<number | null> {
  const sid = secid.trim().toUpperCase();
  const j = await cached(`moex:bondiz2:${sid}`, () =>
    getJson<{ coupons?: { columns?: string[]; data?: unknown[][] } }>(
      `https://iss.moex.com/iss/securities/${encodeURIComponent(sid)}/bondization.json?iss.meta=off`,
    ),
  );
  const rows = issRows(j.coupons);
  if (!rows.length) return null;
  const cut = daysAgo(400);
  let sumRub = 0;
  for (const r of rows) {
    const ds = r.coupondate ?? r.startdate;
    if (!ds) continue;
    const dt = new Date(String(ds).slice(0, 10));
    if (Number.isNaN(dt.getTime()) || dt < cut) continue;
    const pay = couponPaymentRub(r);
    if (pay > 0) sumRub += pay;
  }
  if (sumRub > 0) return Math.round(sumRub * 100) / 100;
  const last = rows[rows.length - 1];
  const pay = couponPaymentRub(last);
  if (!(pay > 0)) return null;
  if (rows.length >= 2) {
    const d0 = new Date(
      String(
        rows[rows.length - 2].coupondate ?? rows[rows.length - 2].startdate,
      ).slice(0, 10),
    );
    const d1 = new Date(
      String(
        rows[rows.length - 1].coupondate ?? rows[rows.length - 1].startdate,
      ).slice(0, 10),
    );
    const days = Math.abs(d1.getTime() - d0.getTime()) / 86400000;
    if (days > 7) return Math.round(((pay * 365) / days) * 100) / 100;
  }
  return Math.round(pay * 2 * 100) / 100;
}

export type QuoteFundamentals = {
  annualIncomePerUnitRub: number | null;
  note: string | null;
};

export async function fetchQuoteFundamentals(
  source: "coingecko" | "moex",
  externalId: string,
  assetKind: InvestmentAssetKind,
  moexMarket?: "shares" | "bonds",
): Promise<QuoteFundamentals> {
  if (source !== "moex") {
    return {
      annualIncomePerUnitRub: null,
      note: null,
    };
  }
  const sid = externalId.trim();
  try {
    if (assetKind === "BOND" || moexMarket === "bonds") {
      const c = await moexBondAnnualCouponRubPerUnit(sid);
      return {
        annualIncomePerUnitRub: c,
        note:
          c != null
            ? "MOEX: оценка годового купона с одной облигации"
            : "MOEX: нет данных по купону",
      };
    }
    if (assetKind === "STOCK") {
      const d = await moexDividendsLastYearSumRubPerShare(sid);
      return {
        annualIncomePerUnitRub: d,
        note:
          d != null
            ? "MOEX: сумма дивидендов на акцию за ~12 мес."
            : "MOEX: нет дивидендов за период",
      };
    }
  } catch {
    return { annualIncomePerUnitRub: null, note: null };
  }
  return { annualIncomePerUnitRub: null, note: null };
}
