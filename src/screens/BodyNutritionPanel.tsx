import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  createNutritionEntry,
  createUserFood,
  deleteNutritionEntry,
  deleteUserFood,
  errorMessage,
  fetchFoodByBarcode,
  patchNutritionEntry,
  patchUserFood,
  searchFoodProducts,
  type BodySettings,
  type FoodNutrition100,
  type MealSlot,
  type NutritionEntryRow,
  type UserFoodRow,
} from "../lib/bodyApi";

const MEAL_ORDER: MealSlot[] = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];
const MEAL_LABEL: Record<MealSlot, string> = {
  BREAKFAST: "Завтрак",
  LUNCH: "Обед",
  DINNER: "Ужин",
  SNACK: "Перекус",
};

function applyPortion100(
  base: FoodNutrition100,
  portionG: number,
): { kcal: number; p: number; f: number; c: number } {
  const q = Math.max(1, portionG) / 100;
  return {
    kcal: Math.max(0, Math.round(base.kcal100 * q)),
    p: Math.round(base.protein100 * q * 10) / 10,
    f: Math.round(base.fat100 * q * 10) / 10,
    c: Math.round(base.carb100 * q * 10) / 10,
  };
}

function FoodScanModal({
  onClose,
  onDecoded,
}: {
  onClose: () => void;
  onDecoded: (code: string) => void;
}) {
  const regionId = useRef(`qr-${Math.random().toString(36).slice(2)}`).current;
  const [err, setErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const instRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const decodedRef = useRef(onDecoded);
  decodedRef.current = onDecoded;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setErr(null);
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const h = new Html5Qrcode(regionId, { verbose: false });
        instRef.current = {
          stop: async () => {
            try {
              await h.stop();
            } catch {
              /* ok */
            }
            try {
              await h.clear();
            } catch {
              /* ok */
            }
          },
        };
        await h.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
          (decodedText) => {
            void instRef.current?.stop();
            decodedRef.current(decodedText);
          },
          () => {},
        );
      } catch (e) {
        if (!cancelled) {
          setErr(
            e instanceof Error
              ? e.message
              : "Не удалось открыть камеру. Разрешите доступ или введите код вручную.",
          );
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();
    return () => {
      cancelled = true;
      void instRef.current?.stop();
    };
  }, [regionId]);

  return createPortal(
    <div
      className="finance__modal-back finance__modal-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="body-scan-title"
    >
      <div className="finance__modal finance__modal--fullscreen">
        <div className="finance__modal-head">
          <h2 id="body-scan-title" className="finance__h2">
            Штрихкод или QR
          </h2>
          <button type="button" className="finance__modal-close" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <p className="screen__text body-nut__scan-hint">
          Наведите камеру на штрихкод товара (EAN) или QR с кодом. Данные КБЖУ —
          из Open Food Facts (на 100 г).
        </p>
        {starting ? <p className="screen__text">Камера…</p> : null}
        {err ? <p className="finance__err">{err}</p> : null}
        <div id={regionId} className="body-nut__scan-region" />
      </div>
    </div>,
    document.body,
  );
}

function UserFoodEditorModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: UserFoodRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kcal, setKcal] = useState(initial?.kcal.toString() ?? "");
  const [p, setP] = useState(initial?.proteinG.toString() ?? "");
  const [f, setF] = useState(initial?.fatG.toString() ?? "");
  const [c, setC] = useState(initial?.carbG.toString() ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormErr(null);
    const nk = Number.parseInt(kcal, 10);
    if (!Number.isFinite(nk) || nk < 0) {
      setFormErr("Ккал: целое ≥ 0");
      setBusy(false);
      return;
    }
    const pg = parseFloat(p.replace(",", "."));
    const fg = parseFloat(f.replace(",", "."));
    const cg = parseFloat(c.replace(",", "."));
    if (!Number.isFinite(pg) || !Number.isFinite(fg) || !Number.isFinite(cg)) {
      setFormErr("БЖУ: числа");
      setBusy(false);
      return;
    }
    if (initial) {
      const r = await patchUserFood(initial.id, {
        name: name.trim(),
        kcal: nk,
        proteinG: pg,
        fatG: fg,
        carbG: cg,
        note: note.trim() || null,
      });
      setBusy(false);
      if (!r.ok) setFormErr(errorMessage(r.data));
      else {
        onSaved();
        onClose();
      }
    } else {
      const r = await createUserFood({
        name: name.trim(),
        kcal: nk,
        proteinG: pg,
        fatG: fg,
        carbG: cg,
        note: note.trim() || null,
      });
      setBusy(false);
      if (!r.ok) setFormErr(errorMessage(r.data));
      else {
        onSaved();
        onClose();
      }
    }
  }

  return createPortal(
    <div
      className="finance__modal-back finance__modal-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-food-title"
    >
      <div className="finance__modal finance__modal--fullscreen">
        <div className="finance__modal-head">
          <h2 id="user-food-title" className="finance__h2">
            {initial ? "Изменить блюдо" : "Новое блюдо"}
          </h2>
          <button type="button" className="finance__modal-close" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <form className="finance__form" onSubmit={(e) => void submit(e)}>
          {formErr ? <p className="finance__err">{formErr}</p> : null}
          <p className="screen__text body-nut__hint">
            Значения на 100 г порции (как в справочнике).
          </p>
          <label className="finance__field">
            Название
            <input
              className="finance__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="finance__field">
            Ккал / 100 г
            <input
              className="finance__input"
              inputMode="numeric"
              value={kcal}
              onChange={(e) => setKcal(e.target.value)}
              required
            />
          </label>
          <div className="body-panel__macro-grid">
            <label className="finance__field">
              Б / 100 г
              <input
                className="finance__input"
                inputMode="decimal"
                value={p}
                onChange={(e) => setP(e.target.value)}
            />
            </label>
            <label className="finance__field">
              Ж / 100 г
              <input
                className="finance__input"
                inputMode="decimal"
                value={f}
                onChange={(e) => setF(e.target.value)}
            />
            </label>
            <label className="finance__field">
              У / 100 г
              <input
                className="finance__input"
                inputMode="decimal"
                value={c}
                onChange={(e) => setC(e.target.value)}
            />
            </label>
          </div>
          <label className="finance__field">
            Заметка
            <input
              className="finance__input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button className="finance__submit" type="submit" disabled={busy}>
            {busy ? "…" : initial ? "Сохранить" : "Добавить"}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}

export default function BodyNutritionPanel({
  settings,
  date,
  onDate,
  entries,
  totals,
  onRefresh,
  userFoods,
}: {
  settings: BodySettings | null;
  date: string;
  onDate: (d: string) => void;
  entries: NutritionEntryRow[];
  totals: { kcal: number; proteinG: number; fatG: number; carbG: number };
  onRefresh: () => void;
  userFoods: UserFoodRow[];
}) {
  const [meal, setMeal] = useState<MealSlot>("BREAKFAST");
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [p, setP] = useState("");
  const [f, setF] = useState("");
  const [carb, setCarb] = useState("");
  const [portionG, setPortionG] = useState("100");
  const portionGRef = useRef(portionG);
  portionGRef.current = portionG;
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<FoodNutrition100[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [base100, setBase100] = useState<FoodNutrition100 | null>(null);

  const [scanOpen, setScanOpen] = useState(false);
  const [userFoodEditor, setUserFoodEditor] = useState<UserFoodRow | "new" | null>(
    null,
  );
  const [editingEntry, setEditingEntry] = useState<NutritionEntryRow | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<MealSlot, NutritionEntryRow[]>();
    for (const s of MEAL_ORDER) map.set(s, []);
    for (const e of entries) {
      map.get(e.mealSlot)?.push(e);
    }
    return map;
  }, [entries]);

  const applyBase = useCallback(
    (base: FoodNutrition100, portionStr: string) => {
      const pg = Number.parseFloat(portionStr.replace(",", "."));
      const portion = Number.isFinite(pg) && pg > 0 ? pg : 100;
      const x = applyPortion100(base, portion);
      setName(base.brand ? `${base.name} (${base.brand})` : base.name);
      setKcal(String(x.kcal));
      setP(String(x.p));
      setF(String(x.f));
      setCarb(String(x.c));
      setBase100(base);
    },
    [],
  );

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchHits([]);
      setSearchOpen(false);
      return;
    }
    searchTimer.current = setTimeout(() => {
      setSearchBusy(true);
      void searchFoodProducts(q).then((r) => {
        setSearchBusy(false);
        if (r.ok) {
          setSearchHits(r.data.products);
          setSearchOpen(true);
        }
      });
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQ]);

  useEffect(() => {
    if (!base100) return;
    const pg = Number.parseFloat(portionG.replace(",", "."));
    if (!Number.isFinite(pg) || pg <= 0) return;
    const x = applyPortion100(base100, pg);
    setKcal(String(x.kcal));
    setP(String(x.p));
    setF(String(x.f));
    setCarb(String(x.c));
  }, [portionG, base100]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setLocalErr(null);
    const k = Number.parseInt(kcal, 10);
    if (!Number.isFinite(k) || k < 0) {
      setLocalErr("Укажите ккал");
      setBusy(false);
      return;
    }
    const r = await createNutritionEntry({
      date,
      mealSlot: meal,
      name: name.trim(),
      portionG: Number.parseFloat(portionG.replace(",", ".")) || null,
      kcal: k,
      proteinG: p.trim() === "" ? 0 : Number(p.replace(",", ".")),
      fatG: f.trim() === "" ? 0 : Number(f.replace(",", ".")),
      carbG: carb.trim() === "" ? 0 : Number(carb.replace(",", ".")),
    });
    setBusy(false);
    if (!r.ok) {
      setLocalErr(errorMessage(r.data));
      return;
    }
    setName("");
    setKcal("");
    setP("");
    setF("");
    setCarb("");
    setPortionG("100");
    setBase100(null);
    setSearchQ("");
    onRefresh();
  }

  async function delEntry(id: string) {
    const r = await deleteNutritionEntry(id);
    if (r.ok) onRefresh();
  }

  async function saveEditEntry(e: FormEvent) {
    e.preventDefault();
    if (!editingEntry) return;
    setBusy(true);
    const k = Number.parseInt(kcal, 10);
    if (!Number.isFinite(k) || k < 0) {
      setLocalErr("Укажите ккал");
      setBusy(false);
      return;
    }
    const r = await patchNutritionEntry(editingEntry.id, {
      mealSlot: meal,
      name: name.trim(),
      portionG: Number.parseFloat(portionG.replace(",", ".")) || null,
      kcal: k,
      proteinG: p.trim() === "" ? 0 : Number(p.replace(",", ".")),
      fatG: f.trim() === "" ? 0 : Number(f.replace(",", ".")),
      carbG: carb.trim() === "" ? 0 : Number(carb.replace(",", ".")),
    });
    setBusy(false);
    if (!r.ok) {
      setLocalErr(errorMessage(r.data));
      return;
    }
    setEditingEntry(null);
    setName("");
    setKcal("");
    setP("");
    setF("");
    setCarb("");
    setPortionG("100");
    setBase100(null);
    onRefresh();
  }

  function beginEditEntry(entry: NutritionEntryRow) {
    setEditingEntry(entry);
    setMeal(entry.mealSlot);
    setName(entry.name);
    setKcal(String(entry.kcal));
    setP(String(entry.proteinG));
    setF(String(entry.fatG));
    setCarb(String(entry.carbG));
    setPortionG(
      entry.portionG != null ? String(entry.portionG) : "100",
    );
    setBase100(null);
    setLocalErr(null);
  }

  function cancelEdit() {
    setEditingEntry(null);
    setName("");
    setKcal("");
    setP("");
    setF("");
    setCarb("");
    setPortionG("100");
    setBase100(null);
    setLocalErr(null);
  }

  const goalK = settings?.bodyKcalGoal;

  return (
    <div className="body-panel">
      <p className="screen__text body-panel__lead">
        Дневник КБЖУ: поиск по базе, штрихкод, свои блюда. Цели — в настройках.
      </p>
      <label className="finance__field">
        День
        <input
          className="finance__input"
          type="date"
          value={date}
          onChange={(e) => onDate(e.target.value)}
        />
      </label>

      {goalK != null && goalK > 0 ? (
        <div className="body-panel__goals">
          <div className="body-panel__goal-row">
            <span>Ккал</span>
            <span>
              {totals.kcal} / {goalK}
            </span>
          </div>
          <div
            className="body-panel__goal-bar"
            role="progressbar"
            aria-valuenow={Math.min(100, Math.round((100 * totals.kcal) / goalK))}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${totals.kcal} из ${goalK} килокалорий`}
          >
            <div
              className="body-panel__goal-fill"
              style={{
                width: `${Math.min(100, (100 * totals.kcal) / goalK)}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="body-nut__user-foods">
        <div className="body-nut__user-foods-head">
          <span className="body-nut__section-title">Мои блюда</span>
          <button
            type="button"
            className="finance__btn-secondary"
            onClick={() => setUserFoodEditor("new")}
          >
            + Добавить
          </button>
        </div>
        {userFoods.length === 0 ? (
          <p className="body-nut__empty">Пока нет сохранённых блюд.</p>
        ) : (
          <ul className="body-nut__user-food-list">
            {userFoods.map((uf) => (
              <li key={uf.id} className="body-nut__user-food-li">
                <button
                  type="button"
                  className="body-nut__user-food-apply"
                  onClick={() => {
                    applyBase(
                      {
                        name: uf.name,
                        brand: null,
                        kcal100: uf.kcal,
                        protein100: uf.proteinG,
                        fat100: uf.fatG,
                        carb100: uf.carbG,
                        code: null,
                      },
                      portionG,
                    );
                  }}
                >
                  {uf.name}
                  <span className="body-nut__user-food-meta">
                    {uf.kcal} ккал · Б{uf.proteinG} Ж{uf.fatG} У{uf.carbG} / 100 г
                  </span>
                </button>
                <div className="body-nut__user-food-actions">
                  <button
                    type="button"
                    className="body-nut__link-btn"
                    onClick={() => setUserFoodEditor(uf)}
                  >
                    Изм.
                  </button>
                  <button
                    type="button"
                    className="body-nut__link-btn body-nut__link-btn--danger"
                    onClick={() =>
                      void deleteUserFood(uf.id).then((r) => {
                        if (r.ok) onRefresh();
                      })
                    }
                  >
                    Удал.
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {MEAL_ORDER.map((slot) => (
        <div key={slot} className="body-panel__meal">
          <h4 className="body-panel__meal-title">{MEAL_LABEL[slot]}</h4>
          <ul className="body-panel__food-list">
            {(grouped.get(slot) ?? []).map((e) => (
              <li key={e.id} className="body-panel__food-li">
                <span>
                  {e.name} — {e.kcal} ккал · Б{e.proteinG.toFixed(0)} Ж
                  {e.fatG.toFixed(0)} У{e.carbG.toFixed(0)}
                </span>
                <span className="body-panel__food-actions">
                  <button
                    type="button"
                    className="body-nut__link-btn"
                    onClick={() => beginEditEntry(e)}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="body-panel__food-del"
                    onClick={() => void delEntry(e.id)}
                    aria-label={`Удалить ${e.name}`}
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {editingEntry ? (
        <form className="finance__form body-nut__form" onSubmit={(e) => void saveEditEntry(e)}>
          <h3 className="finance__h3">Изменить запись</h3>
          {localErr ? <p className="finance__err">{localErr}</p> : null}
          <label className="finance__field">
            Приём
            <select
              className="finance__input"
              value={meal}
              onChange={(e) => setMeal(e.target.value as MealSlot)}
            >
              {MEAL_ORDER.map((s) => (
                <option key={s} value={s}>
                  {MEAL_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="finance__field">
            Продукт / блюдо
            <input
              className="finance__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="finance__field">
            Порция (г)
            <input
              className="finance__input"
              inputMode="decimal"
              value={portionG}
              onChange={(e) => setPortionG(e.target.value)}
            />
          </label>
          <label className="finance__field">
            Ккал
            <input
              className="finance__input"
              inputMode="numeric"
              value={kcal}
              onChange={(e) => setKcal(e.target.value)}
              required
            />
          </label>
          <div className="body-panel__macro-grid">
            <label className="finance__field">
              Б (г)
              <input
                className="finance__input"
                inputMode="decimal"
                value={p}
                onChange={(e) => setP(e.target.value)}
            />
            </label>
            <label className="finance__field">
              Ж (г)
              <input
                className="finance__input"
                inputMode="decimal"
                value={f}
                onChange={(e) => setF(e.target.value)}
            />
            </label>
            <label className="finance__field">
              У (г)
              <input
                className="finance__input"
                inputMode="decimal"
                value={carb}
                onChange={(e) => setCarb(e.target.value)}
            />
            </label>
          </div>
          <div className="body-nut__form-actions">
            <button className="finance__submit" type="submit" disabled={busy}>
              Сохранить
            </button>
            <button
              type="button"
              className="finance__btn-secondary"
              onClick={cancelEdit}
            >
              Отмена
            </button>
          </div>
        </form>
      ) : (
        <form className="finance__form body-nut__form" onSubmit={(e) => void submit(e)}>
          <h3 className="finance__h3">Добавить</h3>
          {localErr ? <p className="finance__err">{localErr}</p> : null}

          <div className="body-nut__search-wrap">
            <label className="finance__field">
              Поиск продукта (автодополнение)
              <input
                className="finance__input"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onFocus={() => searchHits.length > 0 && setSearchOpen(true)}
                placeholder="Начните вводить название…"
                autoComplete="off"
              />
            </label>
            {searchBusy ? (
              <p className="body-nut__search-status">Поиск…</p>
            ) : null}
            {searchOpen && searchHits.length > 0 ? (
              <ul className="body-nut__ac" role="listbox">
                {searchHits.map((h, i) => (
                  <li key={`${h.name}-${h.kcal100}-${i}`}>
                    <button
                      type="button"
                      className="body-nut__ac-item"
                      onClick={() => {
                        applyBase(h, portionG);
                        setSearchOpen(false);
                        setSearchQ("");
                      }}
                    >
                      <span className="body-nut__ac-name">
                        {h.brand ? `${h.name} — ${h.brand}` : h.name}
                      </span>
                      <span className="body-nut__ac-meta">
                        {h.kcal100} ккал · Б{h.protein100} Ж{h.fat100} У{h.carb100}{" "}
                        / 100 г
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="body-nut__scan-row">
            <button
              type="button"
              className="finance__btn-secondary"
              onClick={() => setScanOpen(true)}
            >
              Сканировать штрихкод / QR
            </button>
          </div>

          <label className="finance__field">
            Порция (г), пересчёт от 100 г
            <input
              className="finance__input"
              inputMode="decimal"
              value={portionG}
              onChange={(e) => setPortionG(e.target.value)}
            />
          </label>
          <label className="finance__field">
            Приём
            <select
              className="finance__input"
              value={meal}
              onChange={(e) => setMeal(e.target.value as MealSlot)}
            >
              {MEAL_ORDER.map((s) => (
                <option key={s} value={s}>
                  {MEAL_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="finance__field">
            Продукт / блюдо
            <input
              className="finance__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="finance__field">
            Ккал
            <input
              className="finance__input"
              inputMode="numeric"
              value={kcal}
              onChange={(e) => setKcal(e.target.value)}
              required
            />
          </label>
          <div className="body-panel__macro-grid">
            <label className="finance__field">
              Б (г)
              <input
                className="finance__input"
                inputMode="decimal"
                value={p}
                onChange={(e) => setP(e.target.value)}
            />
            </label>
            <label className="finance__field">
              Ж (г)
              <input
                className="finance__input"
                inputMode="decimal"
                value={f}
                onChange={(e) => setF(e.target.value)}
            />
            </label>
            <label className="finance__field">
              У (г)
              <input
                className="finance__input"
                inputMode="decimal"
                value={carb}
                onChange={(e) => setCarb(e.target.value)}
            />
            </label>
          </div>
          <button className="finance__submit" type="submit" disabled={busy}>
            Добавить в дневник
          </button>
        </form>
      )}

      <p className="body-panel__totals">
        Итого: {totals.kcal} ккал · Б{totals.proteinG.toFixed(0)} Ж
        {totals.fatG.toFixed(0)} У{totals.carbG.toFixed(0)}
      </p>

      {scanOpen ? (
        <FoodScanModal
          onClose={() => setScanOpen(false)}
          onDecoded={(text) => {
            setScanOpen(false);
            const digits = text.replace(/\D/g, "");
            void (async () => {
              const r = await fetchFoodByBarcode(digits.length >= 8 ? digits : text);
              if (r.ok) {
                applyBase(r.data.product, portionGRef.current);
              } else {
                setLocalErr(
                  errorMessage(r.data) ||
                    "Продукт не найден. Попробуйте поиск по названию.",
                );
              }
            })();
          }}
        />
      ) : null}

      {userFoodEditor ? (
        <UserFoodEditorModal
          initial={userFoodEditor === "new" ? null : userFoodEditor}
          onClose={() => setUserFoodEditor(null)}
          onSaved={() => onRefresh()}
        />
      ) : null}
    </div>
  );
}
