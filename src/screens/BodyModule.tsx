import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useShellTabIndex } from "../context/ShellTabContext";
import {
  addWorkoutLine,
  createMeasurement,
  createNutritionEntry,
  createProgram,
  createTrainingDay,
  createTrainingExercise,
  createWorkout,
  deleteMeasurement,
  deleteNutritionEntry,
  deleteProgram,
  deleteTrainingExercise,
  errorMessage,
  fetchBodySettings,
  fetchMeasurements,
  fetchNutritionDay,
  fetchPrograms,
  fetchWorkouts,
  patchBodySettings,
  patchWorkout,
  type BodyMeasurementRow,
  type BodySettings,
  type ExerciseKind,
  type MealSlot,
  type NutritionEntryRow,
  type TrainingProgramRow,
  type WorkoutLogRow,
} from "../lib/bodyApi";
import {
  formatLength,
  formatMass,
  parseLengthInput,
  parseMassInput,
  type BodyLengthUnit,
  type BodyMassUnit,
} from "../lib/bodyUnits";

const SHELL_TAB_BODY = 2;

function modalPortal(node: ReactNode) {
  return createPortal(node, document.body);
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const MEAL_ORDER: MealSlot[] = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];
const MEAL_LABEL: Record<MealSlot, string> = {
  BREAKFAST: "Завтрак",
  LUNCH: "Обед",
  DINNER: "Ужин",
  SNACK: "Перекус",
};

const KIND_LABEL: Record<ExerciseKind, string> = {
  STRENGTH: "Сила",
  CARDIO: "Кардио",
  STRETCH: "Растяжка",
  WARMUP: "Разминка",
  OTHER: "Другое",
};

const TABS = [
  { key: 0, label: "Замеры" },
  { key: 1, label: "Питание" },
  { key: 2, label: "Тренировки" },
] as const;

export default function BodyModule() {
  const shellTab = useShellTabIndex();
  const bodyActive = shellTab === SHELL_TAB_BODY;
  const [tab, setTab] = useState(0);
  const [bump, setBump] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [pending, setPending] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [settings, setSettings] = useState<BodySettings | null>(null);
  const [measurements, setMeasurements] = useState<BodyMeasurementRow[]>([]);
  const [nutritionDate, setNutritionDate] = useState(todayYmd);
  const [nutritionEntries, setNutritionEntries] = useState<NutritionEntryRow[]>(
    [],
  );
  const [nutritionTotals, setNutritionTotals] = useState({
    kcal: 0,
    proteinG: 0,
    fatG: 0,
    carbG: 0,
  });
  const [programs, setPrograms] = useState<TrainingProgramRow[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutLogRow[]>([]);

  const refresh = useCallback(async () => {
    setErr(null);
    const [st, m, p, w] = await Promise.all([
      fetchBodySettings(),
      fetchMeasurements(),
      fetchPrograms(),
      fetchWorkouts(15),
    ]);
    if (!st.ok) {
      setErr(errorMessage(st.data));
      setPending(false);
      return;
    }
    setSettings(st.data);
    if (m.ok) setMeasurements(m.data.measurements);
    else setErr(errorMessage(m.data));
    if (p.ok) setPrograms(p.data.programs);
    if (w.ok) setWorkouts(w.data.workouts);
    setPending(false);
  }, []);

  useEffect(() => {
    if (!bodyActive) return;
    void refresh();
  }, [bodyActive, bump, refresh]);

  useEffect(() => {
    if (!bodyActive) return;
    void (async () => {
      const r = await fetchNutritionDay(nutritionDate);
      if (r.ok) {
        setNutritionEntries(r.data.entries);
        setNutritionTotals(r.data.totals);
      }
    })();
  }, [bodyActive, nutritionDate, bump]);

  const massU = settings?.bodyMassUnit ?? "KG";
  const lenU = settings?.bodyLengthUnit ?? "CM";

  return (
    <div className="body-mod">
      <div className="body-mod__head body-mod__head--row">
        <h1 className="screen__title body-mod__title">Тело</h1>
        <button
          type="button"
          className="body-mod__gear"
          aria-label="Настройки тела"
          onClick={() => setSettingsOpen(true)}
        >
          ⚙
        </button>
      </div>

      <div className="body-mod__swipe">
        <div
          className="body-mod__track"
          style={{ transform: `translateY(-${(tab * 100) / 3}%)` }}
        >
          <div className="body-mod__panel">
            <MeasurementsPanel
              pending={pending}
              err={err}
              measurements={measurements}
              massU={massU}
              lenU={lenU}
              onRefresh={() => setBump((x) => x + 1)}
            />
          </div>
          <div className="body-mod__panel">
            <NutritionPanel
              settings={settings}
              date={nutritionDate}
              onDate={setNutritionDate}
              entries={nutritionEntries}
              totals={nutritionTotals}
              onRefresh={() => setBump((x) => x + 1)}
            />
          </div>
          <div className="body-mod__panel">
            <TrainingPanel
              programs={programs}
              workouts={workouts}
              massU={massU}
              onRefresh={() => setBump((x) => x + 1)}
            />
          </div>
        </div>
      </div>

      <nav className="body-mod__subnav" aria-label="Разделы тела">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={
              tab === t.key
                ? "body-mod__subbtn body-mod__subbtn--on"
                : "body-mod__subbtn"
            }
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {settingsOpen && settings
        ? modalPortal(
            <BodySettingsModal
              settings={settings}
              onClose={() => setSettingsOpen(false)}
              onSaved={(s) => {
                setSettings(s);
                setSettingsOpen(false);
                setBump((x) => x + 1);
              }}
            />,
          )
        : null}
    </div>
  );
}

function BodySettingsModal({
  settings,
  onClose,
  onSaved,
}: {
  settings: BodySettings;
  onClose: () => void;
  onSaved: (s: BodySettings) => void;
}) {
  const [mass, setMass] = useState(settings.bodyMassUnit);
  const [length, setLength] = useState(settings.bodyLengthUnit);
  const [kcal, setKcal] = useState(settings.bodyKcalGoal?.toString() ?? "");
  const [p, setP] = useState(settings.bodyProteinGoalG?.toString() ?? "");
  const [f, setF] = useState(settings.bodyFatGoalG?.toString() ?? "");
  const [c, setC] = useState(settings.bodyCarbGoalG?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormErr(null);
    const kcalGoal =
      kcal.trim() === "" ? null : Math.round(Number(kcal.replace(",", ".")));
    if (kcalGoal !== null && (!Number.isFinite(kcalGoal) || kcalGoal < 0)) {
      setFormErr("Калории: целое число ≥ 0 или пусто");
      setBusy(false);
      return;
    }
    const parseG = (s: string) => {
      if (s.trim() === "") return null;
      const n = Number(s.replace(",", "."));
      return Number.isFinite(n) && n >= 0 ? n : NaN;
    };
    const pg = parseG(p);
    const fg = parseG(f);
    const cg = parseG(c);
    if (
      (p.trim() !== "" && Number.isNaN(pg!)) ||
      (f.trim() !== "" && Number.isNaN(fg!)) ||
      (c.trim() !== "" && Number.isNaN(cg!))
    ) {
      setFormErr("БЖУ: неотрицательные числа или пусто");
      setBusy(false);
      return;
    }
    const r = await patchBodySettings({
      bodyMassUnit: mass,
      bodyLengthUnit: length,
      bodyKcalGoal: kcalGoal,
      bodyProteinGoalG: pg,
      bodyFatGoalG: fg,
      bodyCarbGoalG: cg,
    });
    setBusy(false);
    if (!r.ok) {
      setFormErr(errorMessage(r.data));
      return;
    }
    onSaved(r.data);
  }

  return (
    <div
      className="finance__modal-back finance__modal-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="body-settings-title"
    >
      <div className="finance__modal finance__modal--fullscreen">
        <div className="finance__modal-head">
          <h2 id="body-settings-title" className="finance__h2">
            Настройки тела
          </h2>
          <button type="button" className="finance__modal-close" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <form className="finance__form" onSubmit={(e) => void submit(e)}>
          {formErr ? <p className="finance__err">{formErr}</p> : null}
          <label className="finance__field">
            Единицы массы
            <select
              className="finance__input"
              value={mass}
              onChange={(e) => setMass(e.target.value as BodyMassUnit)}
            >
              <option value="KG">кг</option>
              <option value="LB">lb</option>
            </select>
          </label>
          <label className="finance__field">
            Единицы длины
            <select
              className="finance__input"
              value={length}
              onChange={(e) => setLength(e.target.value as BodyLengthUnit)}
            >
              <option value="CM">см</option>
              <option value="IN">дюймы</option>
            </select>
          </label>
          <h3 className="finance__h3">Цели на день (питание)</h3>
          <label className="finance__field">
            Калории (ккал)
            <input
              className="finance__input"
              inputMode="numeric"
              placeholder="например 2000"
              value={kcal}
              onChange={(e) => setKcal(e.target.value)}
            />
          </label>
          <label className="finance__field">
            Белки (г)
            <input
              className="finance__input"
              inputMode="decimal"
              value={p}
              onChange={(e) => setP(e.target.value)}
            />
          </label>
          <label className="finance__field">
            Жиры (г)
            <input
              className="finance__input"
              inputMode="decimal"
              value={f}
              onChange={(e) => setF(e.target.value)}
            />
          </label>
          <label className="finance__field">
            Углеводы (г)
            <input
              className="finance__input"
              inputMode="decimal"
              value={c}
              onChange={(e) => setC(e.target.value)}
            />
          </label>
          <button className="finance__submit" type="submit" disabled={busy}>
            {busy ? "…" : "Сохранить"}
          </button>
        </form>
      </div>
    </div>
  );
}

function MeasurementsPanel({
  pending,
  err,
  measurements,
  massU,
  lenU,
  onRefresh,
}: {
  pending: boolean;
  err: string | null;
  measurements: BodyMeasurementRow[];
  massU: BodyMassUnit;
  lenU: BodyLengthUnit;
  onRefresh: () => void;
}) {
  const [date, setDate] = useState(todayYmd());
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [fat, setFat] = useState("");
  const [waist, setWaist] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setLocalErr(null);
    const wKg = parseMassInput(weight, massU);
    const hCm = parseLengthInput(height, lenU);
    const r = await createMeasurement({
      date,
      weightKg: wKg ?? undefined,
      heightCm: hCm ?? undefined,
      bodyFatPct:
        fat.trim() === "" ? undefined : Number(fat.replace(",", ".")),
      waistCm:
        waist.trim() === "" ? undefined : parseLengthInput(waist, lenU) ?? undefined,
      note: note.trim() || undefined,
    });
    setBusy(false);
    if (!r.ok) {
      setLocalErr(errorMessage(r.data));
      return;
    }
    setWeight("");
    setHeight("");
    setFat("");
    setWaist("");
    setNote("");
    onRefresh();
  }

  async function del(id: string) {
    if (!confirm("Удалить запись?")) return;
    const r = await deleteMeasurement(id);
    if (r.ok) onRefresh();
  }

  return (
    <div className="body-panel">
      <p className="screen__text body-panel__lead">
        Рост, вес, % жира и обхваты. В базе хранятся кг и см; отображение — по
        настройкам.
      </p>
      {err ? <p className="finance__err">{err}</p> : null}
      {pending ? <p className="screen__text">Загрузка…</p> : null}
      <form className="finance__form body-panel__form" onSubmit={(e) => void submit(e)}>
        {localErr ? <p className="finance__err">{localErr}</p> : null}
        <label className="finance__field">
          Дата
          <input
            className="finance__input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label className="finance__field">
          Вес ({massU === "KG" ? "кг" : "lb"})
          <input
            className="finance__input"
            inputMode="decimal"
            placeholder="—"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </label>
        <label className="finance__field">
          Рост ({lenU === "CM" ? "см" : "″"})
          <input
            className="finance__input"
            inputMode="decimal"
            placeholder="—"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </label>
        <label className="finance__field">
          % жира
          <input
            className="finance__input"
            inputMode="decimal"
            placeholder="—"
            value={fat}
            onChange={(e) => setFat(e.target.value)}
          />
        </label>
        <label className="finance__field">
          Талия ({lenU === "CM" ? "см" : "″"})
          <input
            className="finance__input"
            inputMode="decimal"
            placeholder="—"
            value={waist}
            onChange={(e) => setWaist(e.target.value)}
          />
        </label>
        <label className="finance__field">
          Заметка
          <input
            className="finance__input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
        </label>
        <button className="finance__submit" type="submit" disabled={busy}>
          Сохранить замер
        </button>
      </form>

      <h3 className="finance__h3">Последние замеры</h3>
      <ul className="body-panel__meas-list">
        {measurements.slice(0, 20).map((m) => (
          <li key={m.id} className="body-panel__meas-li">
            <div>
              <strong>{m.date}</strong>
              {m.weightKg != null ? (
                <span> · {formatMass(m.weightKg, massU)}</span>
              ) : null}
              {m.heightCm != null ? (
                <span> · {formatLength(m.heightCm, lenU)}</span>
              ) : null}
              {m.bodyFatPct != null ? (
                <span> · {m.bodyFatPct}% жира</span>
              ) : null}
              {m.waistCm != null ? (
                <span> · талия {formatLength(m.waistCm, lenU)}</span>
              ) : null}
            </div>
            <button
              type="button"
              className="body-panel__meas-del"
              onClick={() => void del(m.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NutritionPanel({
  settings,
  date,
  onDate,
  entries,
  totals,
  onRefresh,
}: {
  settings: BodySettings | null;
  date: string;
  onDate: (d: string) => void;
  entries: NutritionEntryRow[];
  totals: { kcal: number; proteinG: number; fatG: number; carbG: number };
  onRefresh: () => void;
}) {
  const [meal, setMeal] = useState<MealSlot>("BREAKFAST");
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [p, setP] = useState("");
  const [f, setF] = useState("");
  const [carb, setCarb] = useState("");
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<MealSlot, NutritionEntryRow[]>();
    for (const s of MEAL_ORDER) map.set(s, []);
    for (const e of entries) {
      map.get(e.mealSlot)?.push(e);
    }
    return map;
  }, [entries]);

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
    onRefresh();
  }

  async function delEntry(id: string) {
    const r = await deleteNutritionEntry(id);
    if (r.ok) onRefresh();
  }

  const goalK = settings?.bodyKcalGoal;

  return (
    <div className="body-panel">
      <p className="screen__text body-panel__lead">
        Дневник КБЖУ и цели из настроек.
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
            aria-valuenow={Math.min(100, totals.kcal / goalK)}
            aria-valuemin={0}
            aria-valuemax={1}
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
                <button
                  type="button"
                  className="body-panel__food-del"
                  onClick={() => void delEntry(e.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <form className="finance__form" onSubmit={(e) => void submit(e)}>
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
          Добавить
        </button>
      </form>

      <p className="body-panel__totals">
        Итого: {totals.kcal} ккал · Б{totals.proteinG.toFixed(0)} Ж
        {totals.fatG.toFixed(0)} У{totals.carbG.toFixed(0)}
      </p>
    </div>
  );
}

function TrainingPanel({
  programs,
  workouts,
  massU,
  onRefresh,
}: {
  programs: TrainingProgramRow[];
  workouts: WorkoutLogRow[];
  massU: BodyMassUnit;
  onRefresh: () => void;
}) {
  const [progName, setProgName] = useState("");
  const [newDayIdx, setNewDayIdx] = useState("0");
  const [exProgId, setExProgId] = useState("");
  const [exDayId, setExDayId] = useState("");
  const [exName, setExName] = useState("");
  const [exKind, setExKind] = useState<ExerciseKind>("STRENGTH");
  const [exSets, setExSets] = useState("");
  const [exReps, setExReps] = useState("");
  const [exWeight, setExWeight] = useState("");
  const [exDur, setExDur] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedProgram = programs.find((p) => p.id === exProgId);
  const selectedDay = selectedProgram?.days.find((d) => d.id === exDayId);

  useEffect(() => {
    const p = programs.find((x) => x.id === exProgId);
    if (!p || p.days.length === 0) {
      setExDayId("");
      return;
    }
    setExDayId((prev) =>
      prev && p.days.some((d) => d.id === prev) ? prev : p.days[0]!.id,
    );
  }, [exProgId, programs]);

  async function addProgram(e: FormEvent) {
    e.preventDefault();
    if (!progName.trim()) return;
    setBusy(true);
    const r = await createProgram({ name: progName.trim() });
    setBusy(false);
    if (r.ok) {
      setProgName("");
      setExProgId(r.data.program.id);
      onRefresh();
    }
  }

  async function addDay(e: FormEvent) {
    e.preventDefault();
    if (!exProgId) return;
    const idx = Number.parseInt(newDayIdx, 10);
    if (!Number.isFinite(idx) || idx < 0) return;
    setBusy(true);
    const r = await createTrainingDay(exProgId, { dayIndex: idx });
    setBusy(false);
    if (r.ok) onRefresh();
  }

  async function addExercise(e: FormEvent) {
    e.preventDefault();
    if (!selectedDay) return;
    setBusy(true);
    const r = await createTrainingExercise(selectedDay.id, {
      name: exName.trim(),
      kind: exKind,
      sets: exSets.trim() === "" ? null : Number.parseInt(exSets, 10),
      reps: exReps.trim() === "" ? null : Number.parseInt(exReps, 10),
      weightKg:
        exWeight.trim() === ""
          ? null
          : parseMassInput(exWeight, massU) ?? null,
      durationSec:
        exDur.trim() === "" ? null : Number.parseInt(exDur, 10),
    });
    setBusy(false);
    if (r.ok) {
      setExName("");
      setExSets("");
      setExReps("");
      setExWeight("");
      setExDur("");
      onRefresh();
    }
  }

  async function startWorkout() {
    if (!selectedProgram || !selectedDay) return;
    setBusy(true);
    const r = await createWorkout({
      programId: selectedProgram.id,
      trainingDayId: selectedDay.id,
    });
    setBusy(false);
    if (r.ok) onRefresh();
  }

  async function finishWorkout(id: string) {
    const r = await patchWorkout(id, { completed: true });
    if (r.ok) onRefresh();
  }

  async function addLogLine(
    wid: string,
    name: string,
    kind: ExerciseKind,
    json: object,
  ) {
    await addWorkoutLine(wid, { name, kind, resultJson: JSON.stringify(json) });
    onRefresh();
  }

  return (
    <div className="body-panel">
      <p className="screen__text body-panel__lead">
        Программы по дням цикла, упражнения (сила, кардио, разминка и др.) и
        журнал тренировок.
      </p>

      <h3 className="finance__h3">Новая программа</h3>
      <form className="finance__form" onSubmit={(e) => void addProgram(e)}>
        <input
          className="finance__input"
          placeholder="Название"
          value={progName}
          onChange={(e) => setProgName(e.target.value)}
        />
        <button className="finance__submit" type="submit" disabled={busy}>
          Создать
        </button>
      </form>

      <h3 className="finance__h3">Программы</h3>
      <ul className="body-panel__prog-list">
        {programs.map((p) => (
          <li key={p.id} className="body-panel__prog">
            <h4>{p.name}</h4>
            <button
              type="button"
              className="finance__btn-secondary"
              onClick={() => void deleteProgram(p.id).then(() => onRefresh())}
            >
              Удалить
            </button>
            <ul>
              {p.days.map((d) => (
                <li key={d.id}>
                  День {d.dayIndex}
                  {d.name ? ` (${d.name})` : ""}
                  <ul>
                    {d.exercises.map((x) => (
                      <li key={x.id}>
                        {KIND_LABEL[x.kind]} · {x.name}
                        {x.sets != null ? ` · ${x.sets}×${x.reps ?? "—"}` : ""}
                        {x.weightKg != null
                          ? ` · ${formatMass(x.weightKg, massU)}`
                          : ""}
                        {x.durationSec != null
                          ? ` · ${x.durationSec} с`
                          : ""}
                        <button
                          type="button"
                          className="body-panel__meas-del"
                          onClick={() =>
                            void deleteTrainingExercise(x.id).then(() =>
                              onRefresh(),
                            )
                          }
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <h3 className="finance__h3">Добавить день в программу</h3>
      <form className="finance__form" onSubmit={(e) => void addDay(e)}>
        <select
          className="finance__input"
          value={exProgId}
          onChange={(e) => setExProgId(e.target.value)}
        >
          <option value="">— программа —</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          className="finance__input"
          placeholder="Индекс дня (0, 1, 2…)"
          value={newDayIdx}
          onChange={(e) => setNewDayIdx(e.target.value)}
        />
        <button className="finance__submit" type="submit" disabled={busy}>
          Добавить день
        </button>
      </form>

      <h3 className="finance__h3">Добавить упражнение в день</h3>
      <form className="finance__form" onSubmit={(e) => void addExercise(e)}>
        <select
          className="finance__input"
          value={exProgId}
          onChange={(e) => setExProgId(e.target.value)}
        >
          <option value="">— программа —</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          className="finance__input"
          value={exDayId}
          onChange={(e) => setExDayId(e.target.value)}
        >
          {selectedProgram?.days.map((d) => (
            <option key={d.id} value={d.id}>
              День {d.dayIndex}
              {d.name ? ` (${d.name})` : ""}
            </option>
          ))}
        </select>
        <select
          className="finance__input"
          value={exKind}
          onChange={(e) => setExKind(e.target.value as ExerciseKind)}
        >
          {(Object.keys(KIND_LABEL) as ExerciseKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <input
          className="finance__input"
          placeholder="Название"
          value={exName}
          onChange={(e) => setExName(e.target.value)}
          required
        />
        <div className="body-panel__macro-grid">
          <input
            className="finance__input"
            placeholder="Подходы"
            inputMode="numeric"
            value={exSets}
            onChange={(e) => setExSets(e.target.value)}
          />
          <input
            className="finance__input"
            placeholder="Повторы"
            inputMode="numeric"
            value={exReps}
            onChange={(e) => setExReps(e.target.value)}
          />
          <input
            className="finance__input"
            placeholder={`Вес (${massU})`}
            value={exWeight}
            onChange={(e) => setExWeight(e.target.value)}
          />
          <input
            className="finance__input"
            placeholder="Сек (кардио)"
            inputMode="numeric"
            value={exDur}
            onChange={(e) => setExDur(e.target.value)}
          />
        </div>
        <button className="finance__submit" type="submit" disabled={busy}>
          Добавить упражнение
        </button>
      </form>

      <h3 className="finance__h3">Быстрый старт тренировки</h3>
      <p className="screen__text">
        Выберите программу и день, затем «Начать» — появится запись в журнале.
      </p>
      <div className="body-panel__row">
        <select
          className="finance__input"
          value={exProgId}
          onChange={(e) => setExProgId(e.target.value)}
        >
          <option value="">— программа —</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          className="finance__input"
          value={exDayId}
          onChange={(e) => setExDayId(e.target.value)}
        >
          {selectedProgram?.days.map((d) => (
            <option key={d.id} value={d.id}>
              День {d.dayIndex}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="finance__submit"
          disabled={busy || !selectedDay}
          onClick={() => void startWorkout()}
        >
          Начать тренировку
        </button>
      </div>

      <h3 className="finance__h3">Журнал</h3>
      <ul className="body-panel__workout-list">
        {workouts.map((w) => (
          <li key={w.id} className="body-panel__workout">
            <div>
              {new Date(w.startedAt).toLocaleString("ru-RU")}
              {w.program ? ` · ${w.program.name}` : ""}
              {w.completedAt ? " · завершена" : " · в процессе"}
            </div>
            {!w.completedAt ? (
              <button
                type="button"
                className="finance__btn-secondary"
                onClick={() => void finishWorkout(w.id)}
              >
                Завершить
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
