import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAccounts,
  errorMessage as financeErrorMessage,
} from "../lib/financeApi";
import {
  fetchBodySettings,
  fetchMeasurements,
  fetchNutritionDay,
  fetchWorkouts,
  errorMessage as bodyErrorMessage,
} from "../lib/bodyApi";
import { formatRubFromMinor } from "../lib/money";
import { loadHeroLocalState, splitTotalExp } from "../lib/heroLocalState";
import {
  consecutiveStreakFrom,
  measurementDateSet,
  workoutDatesFromCompleted,
  ymdAddDays,
  ymdToday,
} from "../lib/heroStreaks";
import { useShellGoToTab } from "../context/ShellTabContext";
import { SHELL_TAB } from "../lib/shellTabs";

function heroTitleForLevel(level: number): string {
  if (level < 3) return "Новичок";
  if (level < 6) return "Искатель порядка";
  if (level < 10) return "Страж привычек";
  if (level < 15) return "Герой дня";
  return "Легенда";
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

export default function HubScreen() {
  const goToTab = useShellGoToTab();
  const heroPersist = useMemo(() => loadHeroLocalState(), []);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [financeLine, setFinanceLine] = useState<string | null>(null);
  const [bodyKcalLine, setBodyKcalLine] = useState<string | null>(null);
  const [workoutStreak, setWorkoutStreak] = useState<number | null>(null);
  const [measStreak, setMeasStreak] = useState<number | null>(null);

  const { level, expInLevel, expToNext } = useMemo(
    () => splitTotalExp(heroPersist.totalExp),
    [heroPersist.totalExp],
  );
  const expPct = expToNext > 0 ? pct(expInLevel, expToNext) : 100;

  const refreshHub = useCallback(async () => {
    setLoadError(null);
    const today = ymdToday();
    const fromMeas = ymdAddDays(today, -120);

    const [acc, nut, st, wo, meas] = await Promise.all([
      fetchAccounts(),
      fetchNutritionDay(today),
      fetchBodySettings(),
      fetchWorkouts(150),
      fetchMeasurements({ from: fromMeas }),
    ]);

    const errs: string[] = [];
    if (acc.ok) {
      const sumAcc = acc.data.accounts.reduce((s, a) => s + a.balanceMinor, 0);
      const inv = acc.data.investmentsTotalMinor;
      const grand = sumAcc + inv;
      setFinanceLine(`Всего: ${formatRubFromMinor(grand)}`);
    } else {
      setFinanceLine(null);
      errs.push(financeErrorMessage(acc.data));
    }

    if (nut.ok && st.ok) {
      const t = nut.data.totals;
      const goal = st.data.bodyKcalGoal;
      if (goal != null && goal > 0) {
        setBodyKcalLine(
          `Ккал: ${Math.round(t.kcal)} / ${goal} (${pct(t.kcal, goal)}%)`,
        );
      } else {
        setBodyKcalLine(`Ккал за сегодня: ${Math.round(t.kcal)}`);
      }
    } else {
      setBodyKcalLine(null);
      if (!nut.ok) errs.push(bodyErrorMessage(nut.data));
      if (!st.ok) errs.push(bodyErrorMessage(st.data));
    }

    if (wo.ok) {
      const completed = wo.data.workouts
        .filter((w) => w.completedAt)
        .map((w) => w.completedAt as string);
      const wDates = workoutDatesFromCompleted(completed);
      setWorkoutStreak(consecutiveStreakFrom(wDates, today));
    } else {
      setWorkoutStreak(null);
      errs.push(bodyErrorMessage(wo.data));
    }

    if (meas.ok) {
      const mDates = measurementDateSet(meas.data.measurements.map((m) => m.date));
      setMeasStreak(consecutiveStreakFrom(mDates, today));
    } else {
      setMeasStreak(null);
      errs.push(bodyErrorMessage(meas.data));
    }

    if (errs.length) setLoadError(errs[0] ?? null);
  }, []);

  useEffect(() => {
    void refreshHub();
  }, [refreshHub]);

  return (
    <div className="screen hero">
      <p className="screen__badge">Главная</p>
      <h1 className="screen__title hero__title">Герой</h1>

      <section className="hero__panel" aria-labelledby="hero-game-heading">
        <h2 id="hero-game-heading" className="hero__sr-only">
          Прогресс героя
        </h2>
        <div className="hero__avatar-wrap">
          <div className="hero__avatar" aria-hidden>
            <span className="hero__avatar-icon">⚔</span>
          </div>
          <div className="hero__level-block">
            <div className="hero__level-row">
              <span className="hero__level-num">Ур. {level}</span>
              <span className="hero__level-title">{heroTitleForLevel(level)}</span>
            </div>
            <div
              className="hero__exp-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={expToNext}
              aria-valuenow={expInLevel}
              aria-label={`Опыт ${expInLevel} из ${expToNext}`}
            >
              <div className="hero__exp-fill" style={{ width: `${expPct}%` }} />
            </div>
            <p className="hero__exp-caption">
              EXP {expInLevel} / {expToNext}
              <span className="hero__exp-hint">
                {" "}
                · начисления из действий — позже (локальный задел)
              </span>
            </p>
          </div>
        </div>
      </section>

      <section className="hero__card" aria-labelledby="hero-focus-heading">
        <h2 id="hero-focus-heading" className="hero__card-title">
          Сегодня
        </h2>
        <p className="hero__card-text">
          Задачи и квесты дня появятся здесь, когда будет модуль «Задачи» и API
          квестов. Пока фокус — замеры, питание и финансы.
        </p>
        <div className="hero__card-actions">
          <button
            type="button"
            className="hero__btn hero__btn--primary"
            onClick={() => goToTab(SHELL_TAB.BODY)}
          >
            Тело
          </button>
          <button
            type="button"
            className="hero__btn"
            onClick={() => goToTab(SHELL_TAB.TODO)}
          >
            Задачи
          </button>
        </div>
      </section>

      <section className="hero__streaks" aria-label="Серии">
        {(workoutStreak != null && workoutStreak > 0) ||
        (measStreak != null && measStreak > 0) ? (
          <div className="hero__streak-chips">
            {workoutStreak != null && workoutStreak > 0 ? (
              <span className="hero__chip" title="Подряд дней с завершённой тренировкой">
                Тренировки: {workoutStreak} дн.
              </span>
            ) : null}
            {measStreak != null && measStreak > 0 ? (
              <span className="hero__chip" title="Подряд дней с записью замера">
                Замеры: {measStreak} дн.
              </span>
            ) : null}
          </div>
        ) : (
          <p className="hero__streak-empty">
            Серии ещё не начались — отметьте тренировку или замер в «Тело».
          </p>
        )}
      </section>

      <section className="hero__minigrid" aria-label="Краткая сводка">
        <button
          type="button"
          className="hero__mini hero__mini--click"
          onClick={() => goToTab(SHELL_TAB.BODY)}
        >
          <span className="hero__mini-label">Тело</span>
          <span className="hero__mini-value">
            {bodyKcalLine ?? "Нет данных за сегодня"}
          </span>
        </button>
        <button
          type="button"
          className="hero__mini hero__mini--click"
          onClick={() => goToTab(SHELL_TAB.FINANCE)}
        >
          <span className="hero__mini-label">Финансы</span>
          <span className="hero__mini-value">
            {financeLine ?? "Не удалось загрузить"}
          </span>
        </button>
      </section>

      <section className="hero__card hero__card--quest" aria-labelledby="hero-quest-heading">
        <h2 id="hero-quest-heading" className="hero__card-title">
          Квест
        </h2>
        <p className="hero__card-text hero__card-text--muted">
          Активных квестов пока нет. Шаги квеста будут дублироваться в «Задачи»,
          чтобы не вести двойной учёт.
        </p>
        <div className="hero__quest-placeholder">
          <span className="hero__quest-dots">○ ○ ○ ○ ○</span>
          <span className="hero__quest-progress">0 / 0 шагов</span>
        </div>
      </section>

      <section className="hero__future" aria-label="Скоро">
        <span className="hero__future-label">Скоро</span>
        <div className="hero__future-btns">
          <button type="button" className="hero__icon-btn" disabled title="Инвентарь">
            🎒
          </button>
          <button type="button" className="hero__icon-btn" disabled title="Питомец">
            🐾
          </button>
          <button type="button" className="hero__icon-btn" disabled title="Мини-игра">
            🎮
          </button>
        </div>
      </section>

      {loadError ? (
        <p className="hero__warn" role="status">
          {loadError}
        </p>
      ) : null}
    </div>
  );
}
