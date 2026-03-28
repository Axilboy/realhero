import { useCallback, useEffect, useRef, useState } from "react";
import {
  errorMessage,
  fetchInvestQuotePrice,
  searchInvestQuotes,
  type InvestmentAssetKind,
  type QuoteSearchHit,
} from "../lib/financeApi";

export type InvestQuoteApplyPayload = {
  displayName: string;
  assetKind: InvestmentAssetKind;
  priceRub: number;
};

type Props = {
  onApply: (p: InvestQuoteApplyPayload) => void;
  disabled?: boolean;
};

function defaultHistoryDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

export default function InvestQuotePicker({ onApply, disabled }: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<QuoteSearchHit[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<QuoteSearchHit | null>(null);
  const [priceMode, setPriceMode] = useState<"live" | "date">("live");
  const [histDate, setHistDate] = useState(defaultHistoryDate);
  const [priceRub, setPriceRub] = useState<number | null>(null);
  const [priceNote, setPriceNote] = useState<string | null>(null);
  const [priceBusy, setPriceBusy] = useState(false);
  const [priceErr, setPriceErr] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async (query: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setSearchBusy(true);
    setSearchErr(null);
    const r = await searchInvestQuotes(query);
    if (ac.signal.aborted) return;
    setSearchBusy(false);
    if (!r.ok) {
      setHits([]);
      setSearchErr(errorMessage(r.data));
      return;
    }
    setHits(r.data.results);
  }, []);

  useEffect(() => {
    const t = q.trim();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (t.length < 2) {
      setHits([]);
      setSearchErr(null);
      return;
    }
    searchTimer.current = setTimeout(() => void runSearch(t), 380);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [q, runSearch]);

  const loadPrice = useCallback(async () => {
    if (!selected) return;
    setPriceBusy(true);
    setPriceErr(null);
    setPriceRub(null);
    setPriceNote(null);
    const r = await fetchInvestQuotePrice({
      source: selected.source,
      id: selected.externalId,
      date: priceMode === "date" ? histDate : undefined,
    });
    setPriceBusy(false);
    if (!r.ok) {
      setPriceErr(errorMessage(r.data));
      return;
    }
    setPriceRub(r.data.priceRub);
    setPriceNote(r.data.note);
  }, [selected, priceMode, histDate]);

  useEffect(() => {
    if (!selected || priceMode !== "live") return;
    void loadPrice();
  }, [selected, priceMode, loadPrice]);

  function pickHit(h: QuoteSearchHit) {
    setSelected(h);
    setOpen(false);
    setQ(`${h.name} (${h.symbol})`);
    setPriceRub(null);
    setPriceErr(null);
    setPriceNote(null);
  }

  function apply() {
    if (!selected || priceRub == null || priceRub <= 0) return;
    onApply({
      displayName: `${selected.name} (${selected.symbol})`,
      assetKind: selected.assetKind,
      priceRub,
    });
  }

  const srcLabel =
    selected?.source === "moex"
      ? "MOEX"
      : selected?.source === "coingecko"
        ? "CoinGecko"
        : "";

  return (
    <div className="finance-invquote">
      <p className="finance-invquote__hint">
        Поиск: крипто (CoinGecko) и акции РФ (MOEX). Цены ориентировочные.
      </p>
      <div className="finance-invquote__search-wrap">
        <input
          className="finance__input"
          type="search"
          autoComplete="off"
          placeholder="Название или тикер…"
          value={q}
          disabled={disabled}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            if (!e.target.value.trim()) setSelected(null);
          }}
          onFocus={() => setOpen(true)}
        />
        {open && q.trim().length >= 2 ? (
          <div className="finance-invquote__dd" role="listbox">
            {searchBusy ? (
              <div className="finance-invquote__dd-row">Поиск…</div>
            ) : null}
            {searchErr ? (
              <div className="finance-invquote__dd-err">{searchErr}</div>
            ) : null}
            {!searchBusy && !searchErr && hits.length === 0 ? (
              <div className="finance-invquote__dd-row">Ничего не найдено</div>
            ) : null}
            {hits.map((h) => (
              <button
                key={`${h.source}-${h.externalId}`}
                type="button"
                role="option"
                className="finance-invquote__dd-hit"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickHit(h)}
              >
                <span className="finance-invquote__hit-name">{h.name}</span>
                <span className="finance-invquote__hit-meta">
                  {h.symbol} · {h.source === "moex" ? "акция РФ" : "крипто"}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {selected ? (
        <>
          <div
            className="finance-addop__carousel finance-invquote__modes"
            role="tablist"
            aria-label="Какую цену подставить"
          >
            <button
              type="button"
              role="tab"
              className={
                priceMode === "live"
                  ? "finance-addop__chip finance-addop__chip--on"
                  : "finance-addop__chip"
              }
              onClick={() => {
                setPriceMode("live");
                setPriceRub(null);
                setPriceErr(null);
              }}
            >
              Сейчас
            </button>
            <button
              type="button"
              role="tab"
              className={
                priceMode === "date"
                  ? "finance-addop__chip finance-addop__chip--on"
                  : "finance-addop__chip"
              }
              onClick={() => {
                setPriceMode("date");
                setPriceRub(null);
                setPriceErr(null);
              }}
            >
              На дату
            </button>
          </div>
          {priceMode === "date" ? (
            <label className="finance__field">
              Дата котировки
              <input
                className="finance__input"
                type="date"
                value={histDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setHistDate(e.target.value)}
              />
            </label>
          ) : null}
          {priceMode === "date" ? (
            <button
              type="button"
              className="finance__btn-secondary finance-invquote__fetch"
              disabled={disabled || priceBusy}
              onClick={() => void loadPrice()}
            >
              {priceBusy ? "…" : "Получить цену на дату"}
            </button>
          ) : priceBusy ? (
            <p className="finance-invquote__status">Загрузка цены…</p>
          ) : null}
          {priceErr ? <p className="finance__err">{priceErr}</p> : null}
          {priceRub != null && priceRub > 0 ? (
            <div className="finance-invquote__price-block">
              <p className="finance-invquote__price-val">
                ≈{" "}
                {priceRub.toLocaleString("ru-RU", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 8,
                })}{" "}
                ₽ <span className="finance-invquote__src">({srcLabel})</span>
              </p>
              {priceNote ? (
                <p className="finance-invquote__price-note">{priceNote}</p>
              ) : null}
              <button
                type="button"
                className="finance__submit finance-invquote__apply"
                disabled={disabled}
                onClick={() => apply()}
              >
                Подставить в форму
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
