import type { InvestmentAssetKind } from "@prisma/client";

export type QuoteSearchHit = {
  source: "coingecko" | "moex";
  externalId: string;
  name: string;
  symbol: string;
  assetKind: InvestmentAssetKind;
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
    if (!sid || !/^[A-Z0-9-]+$/.test(sid)) continue;
    const shortname = String(r.shortname ?? sid);
    const name = String(r.secname ?? r.name ?? shortname);
    out.push({
      source: "moex",
      externalId: sid,
      name: name.length > 120 ? name.slice(0, 117) + "…" : name,
      symbol: sid,
      assetKind: "STOCK",
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

async function priceMoexRub(
  secid: string,
  dateYmd: string | undefined,
): Promise<{ priceRub: number; asOf: string | null; note?: string }> {
  const sid = secid.trim().toUpperCase();
  if (!/^[A-Z0-9-]{1,20}$/.test(sid)) {
    throw new Error("invalid moex secid");
  }
  if (dateYmd) {
    const tryUrls = [
      `https://iss.moex.com/iss/history/engines/stock/markets/shares/boards/TQBR/securities/${encodeURIComponent(sid)}.json?from=${dateYmd}&till=${dateYmd}&iss.meta=off`,
      `https://iss.moex.com/iss/history/engines/stock/markets/shares/securities/${encodeURIComponent(sid)}.json?from=${dateYmd}&till=${dateYmd}&iss.meta=off`,
    ];
    let rows: Record<string, unknown>[] = [];
    for (const u of tryUrls) {
      const j = await cached(`moex:hist:${sid}:${dateYmd}:${u}`, () =>
        getJson<{ history?: { columns?: string[]; data?: unknown[][] } }>(u),
      );
      rows = issRows(j.history);
      if (rows.length) break;
    }
    const row =
      rows.find((r) => String(r.boardid ?? "").toUpperCase() === "TQBR") ??
      rows[0];
    if (!row) throw new Error("no history row");
    const close = row.close ?? row.legalcloseprice ?? row.marketprice2;
    const num = typeof close === "number" ? close : Number(close);
    if (!Number.isFinite(num) || num <= 0) throw new Error("no close price");
    return {
      priceRub: num,
      asOf: dateYmd,
      note: "MOEX, цена закрытия (₽)",
    };
  }
  const url = `https://iss.moex.com/iss/engines/stock/markets/shares/securities/${encodeURIComponent(sid)}.json?iss.meta=off`;
  const j = await cached(`moex:md:${sid}`, () => getJson<{
    marketdata?: { columns?: string[]; data?: unknown[][] };
  }>(url));
  const rows = issRows(j.marketdata);
  const pick =
    rows.find((r) => String(r.secid ?? "").toUpperCase() === sid) ?? rows[0];
  if (!pick) throw new Error("no marketdata");
  const last = pick.last;
  const prev = pick.prevprice;
  const raw =
    last != null && Number(last) > 0 ? Number(last) : Number(prev);
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new Error("no last price");
  }
  return {
    priceRub: raw,
    asOf: null,
    note: "MOEX, последняя сделка или закрытие",
  };
}

export async function fetchQuotePriceRub(
  source: "coingecko" | "moex",
  id: string,
  dateYmd?: string,
): Promise<{ priceRub: number; asOf: string | null; note?: string }> {
  if (source === "coingecko") {
    return priceCoinGeckoRub(id, dateYmd);
  }
  return priceMoexRub(id, dateYmd);
}
