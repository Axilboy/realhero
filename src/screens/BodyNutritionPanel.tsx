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
import { useI18n } from "../i18n/I18nContext";

const MEAL_ORDER: MealSlot[] = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];

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
  t,
  onClose,
  onDecoded,
}: {
  t: (key: string, vars?: Record<string, string | number>) => string;
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
              : t("body.scanCameraErr"),
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
            {t("body.barcodeOrQr")}
          </h2>
          <button type="button" className="finance__modal-close" onClick={onClose}>
            {t("body.close")}
          </button>
        </div>
        <p className="screen__text body-nut__scan-hint">
          {t("body.scanHint")}
        </p>
        {starting ? <p className="screen__text">{t("body.cameraStarting")}</p> : null}
        {err ? <p className="finance__err">{err}</p> : null}
        <div id={regionId} className="body-nut__scan-region" />
      </div>
    </div>,
    document.body,
  );
}

function UserFoodEditorModal({
  t,
  initial,
  onClose,
  onSaved,
}: {
  t: (key: string, vars?: Record<string, string | number>) => string;
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
      setFormErr(t("body.errKcalInt"));
      setBusy(false);
      return;
    }
    const pg = parseFloat(p.replace(",", "."));
    const fg = parseFloat(f.replace(",", "."));
    const cg = parseFloat(c.replace(",", "."));
    if (!Number.isFinite(pg) || !Number.isFinite(fg) || !Number.isFinite(cg)) {
      setFormErr(t("body.errMacroNum"));
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
            {initial ? t("body.editFood") : t("body.newFood")}
          </h2>
          <button type="button" className="finance__modal-close" onClick={onClose}>
            {t("body.close")}
          </button>
        </div>
        <form className="finance__form" onSubmit={(e) => void submit(e)}>
          {formErr ? <p className="finance__err">{formErr}</p> : null}
          <p className="screen__text body-nut__hint">
            {t("body.per100g")}
          </p>
          <label className="finance__field">
            {t("body.foodName")}
            <input
              className="finance__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="finance__field">
            {t("body.kcalPer100")}
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
              {t("body.pPer100")}
              <input
                className="finance__input"
                inputMode="decimal"
                value={p}
                onChange={(e) => setP(e.target.value)}
            />
            </label>
            <label className="finance__field">
              {t("body.fPer100")}
              <input
                className="finance__input"
                inputMode="decimal"
                value={f}
                onChange={(e) => setF(e.target.value)}
            />
            </label>
            <label className="finance__field">
              {t("body.cPer100")}
              <input
                className="finance__input"
                inputMode="decimal"
                value={c}
                onChange={(e) => setC(e.target.value)}
            />
            </label>
          </div>
          <label className="finance__field">
            {t("body.noteFood")}
            <input
              className="finance__input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button className="finance__submit" type="submit" disabled={busy}>
            {busy ? "…" : initial ? t("body.save") : t("body.addSection")}
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
  const { t } = useI18n();
  const mealLabels = useMemo(
    () => ({
      BREAKFAST: t("body.mealBreakfast"),
      LUNCH: t("body.mealLunch"),
      DINNER: t("body.mealDinner"),
      SNACK: t("body.mealSnack"),
    }),
    [t],
  );
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
      setLocalErr(t("body.errKcalRequired"));
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
      setLocalErr(t("body.errKcalRequired"));
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
        {t("body.nutritionLead")}
      </p>
      <label className="finance__field">
        {t("body.day")}
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
            <span>{t("body.kcalShort")}</span>
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
            aria-valuetext={t("body.kcalAria", {
              cur: totals.kcal,
              goal: goalK,
            })}
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
          <span className="body-nut__section-title">{t("body.myFoods")}</span>
          <button
            type="button"
            className="finance__btn-secondary"
            onClick={() => setUserFoodEditor("new")}
          >
            {t("body.addFoodBtn")}
          </button>
        </div>
        {userFoods.length === 0 ? (
          <p className="body-nut__empty">{t("body.noSavedFoods")}</p>
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
                    {t("body.kcalMacroLine", {
                      k: uf.kcal,
                      p: uf.proteinG,
                      f: uf.fatG,
                      c: uf.carbG,
                    })}
                  </span>
                </button>
                <div className="body-nut__user-food-actions">
                  <button
                    type="button"
                    className="body-nut__link-btn"
                    onClick={() => setUserFoodEditor(uf)}
                  >
                    {t("body.editShort")}
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
                    {t("body.delShort")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {MEAL_ORDER.map((slot) => (
        <div key={slot} className="body-panel__meal">
          <h4 className="body-panel__meal-title">{mealLabels[slot]}</h4>
          <ul className="body-panel__food-list">
            {(grouped.get(slot) ?? []).map((e) => (
              <li key={e.id} className="body-panel__food-li">
                <span>
                  {t("body.dishLine", {
                    name: e.name,
                    k: e.kcal,
                    p: e.proteinG.toFixed(0),
                    f: e.fatG.toFixed(0),
                    c: e.carbG.toFixed(0),
                  })}
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
                    aria-label={t("body.deleteEntryAria", { name: e.name })}
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
          <h3 className="finance__h3">{t("body.editEntry")}</h3>
          {localErr ? <p className="finance__err">{localErr}</p> : null}
          <label className="finance__field">
            {t("body.meal")}
            <select
              className="finance__input"
              value={meal}
              onChange={(e) => setMeal(e.target.value as MealSlot)}
            >
              {MEAL_ORDER.map((s) => (
                <option key={s} value={s}>
                  {mealLabels[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="finance__field">
            {t("body.product")}
            <input
              className="finance__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="finance__field">
            {t("body.portionG")}
            <input
              className="finance__input"
              inputMode="decimal"
              value={portionG}
              onChange={(e) => setPortionG(e.target.value)}
            />
          </label>
          <label className="finance__field">
            {t("body.kcal")}
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
              {t("body.pShort")}
              <input
                className="finance__input"
                inputMode="decimal"
                value={p}
                onChange={(e) => setP(e.target.value)}
            />
            </label>
            <label className="finance__field">
              {t("body.fShort")}
              <input
                className="finance__input"
                inputMode="decimal"
                value={f}
                onChange={(e) => setF(e.target.value)}
            />
            </label>
            <label className="finance__field">
              {t("body.cShort")}
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
              {t("body.save")}
            </button>
            <button
              type="button"
              className="finance__btn-secondary"
              onClick={cancelEdit}
            >
              {t("body.cancel")}
            </button>
          </div>
        </form>
      ) : (
        <form className="finance__form body-nut__form" onSubmit={(e) => void submit(e)}>
          <h3 className="finance__h3">{t("body.addSection")}</h3>
          {localErr ? <p className="finance__err">{localErr}</p> : null}

          <div className="body-nut__search-wrap">
            <p className="screen__text body-nut__off-caption">
              {t("body.offSearchCaption")}
            </p>
            <label className="finance__field">
              {t("body.searchProduct")}
              <input
                className="finance__input"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onFocus={() => searchHits.length > 0 && setSearchOpen(true)}
                placeholder={t("body.searchPlaceholder")}
                autoComplete="off"
              />
            </label>
            {searchBusy ? (
              <p className="body-nut__search-status">{t("body.searching")}</p>
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
                        {t("body.acMeta100", {
                          k: h.kcal100,
                          p: h.protein100,
                          f: h.fat100,
                          c: h.carb100,
                        })}
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
              {t("body.scanBarcode")}
            </button>
          </div>

          <label className="finance__field">
            {t("body.portionFrom100")}
            <input
              className="finance__input"
              inputMode="decimal"
              value={portionG}
              onChange={(e) => setPortionG(e.target.value)}
            />
          </label>
          <label className="finance__field">
            {t("body.meal")}
            <select
              className="finance__input"
              value={meal}
              onChange={(e) => setMeal(e.target.value as MealSlot)}
            >
              {MEAL_ORDER.map((s) => (
                <option key={s} value={s}>
                  {mealLabels[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="finance__field">
            {t("body.product")}
            <input
              className="finance__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="finance__field">
            {t("body.kcal")}
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
              {t("body.pShort")}
              <input
                className="finance__input"
                inputMode="decimal"
                value={p}
                onChange={(e) => setP(e.target.value)}
            />
            </label>
            <label className="finance__field">
              {t("body.fShort")}
              <input
                className="finance__input"
                inputMode="decimal"
                value={f}
                onChange={(e) => setF(e.target.value)}
            />
            </label>
            <label className="finance__field">
              {t("body.cShort")}
              <input
                className="finance__input"
                inputMode="decimal"
                value={carb}
                onChange={(e) => setCarb(e.target.value)}
            />
            </label>
          </div>
          <button className="finance__submit" type="submit" disabled={busy}>
            {t("body.addToDiary")}
          </button>
        </form>
      )}

      <p className="body-panel__totals">
        {t("body.totalsLine", {
          k: totals.kcal,
          p: totals.proteinG.toFixed(0),
          f: totals.fatG.toFixed(0),
          c: totals.carbG.toFixed(0),
        })}
      </p>

      {scanOpen ? (
        <FoodScanModal
          t={t}
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
                  errorMessage(r.data) || t("body.productNotFound"),
                );
              }
            })();
          }}
        />
      ) : null}

      {userFoodEditor ? (
        <UserFoodEditorModal
          t={t}
          initial={userFoodEditor === "new" ? null : userFoodEditor}
          onClose={() => setUserFoodEditor(null)}
          onSaved={() => onRefresh()}
        />
      ) : null}
    </div>
  );
}
