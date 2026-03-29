import { useMemo } from "react";
import type { BodyMeasurementRow, BodySettings, WorkoutLogRow } from "../lib/bodyApi";
import type { BodyLengthUnit, BodyMassUnit } from "../lib/bodyUnits";
import { formatLength, formatMass } from "../lib/bodyUnits";

type Props = {
  pending: boolean;
  err: string | null;
  measurements: BodyMeasurementRow[];
  massU: BodyMassUnit;
  lenU: BodyLengthUnit;
  settings: BodySettings | null;
  todayTotals: { kcal: number; proteinG: number; fatG: number; carbG: number };
  workouts: WorkoutLogRow[];
  onOpenMeasurements: () => void;
};

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysAgoYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function WeightSparkline({ points }: { points: { date: string; kg: number }[] }) {
  const w = 280;
  const h = 56;
  const pad = 4;
  if (points.length < 2) {
    return (
      <div className="body-home__spark-empty">
        Добавьте ещё замеры с весом — появится график.
      </div>
    );
  }
  const vals = points.map((p) => p.kg);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const pts = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * innerW;
    const y = pad + innerH - ((p.kg - min) / span) * innerH;
    return `${x},${y}`;
  });
  return (
    <svg
      className="body-home__spark"
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="#81c995"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts.join(" ")}
      />
    </svg>
  );
}

export default function BodyHomePanel({
  pending,
  err,
  measurements,
  massU,
  lenU,
  settings,
  todayTotals,
  workouts,
  onOpenMeasurements,
}: Props) {
  const weightSeries = useMemo(() => {
    const rows = measurements
      .filter((m) => m.weightKg != null && m.weightKg > 0)
      .sort((a, b) => parseYmd(a.date).getTime() - parseYmd(b.date).getTime());
    return rows.slice(-24).map((m) => ({ date: m.date, kg: m.weightKg! }));
  }, [measurements]);

  const lastMeas = useMemo(() => {
    const withW = measurements
      .filter((m) => m.weightKg != null)
      .sort((a, b) => parseYmd(b.date).getTime() - parseYmd(a.date).getTime());
    return withW[0] ?? null;
  }, [measurements]);

  const weightDelta = useMemo(() => {
    if (!lastMeas?.weightKg) return null;
    const cut7 = daysAgoYmd(7);
    const cut30 = daysAgoYmd(30);
    const sorted = measurements
      .filter((m) => m.weightKg != null && m.weightKg > 0)
      .sort((a, b) => parseYmd(a.date).getTime() - parseYmd(b.date).getTime());
    const last = lastMeas.weightKg;
    const old7 = [...sorted].filter((m) => m.date <= cut7).pop();
    const old30 = [...sorted].filter((m) => m.date <= cut30).pop();
    const d7 =
      old7?.weightKg != null ? last - old7.weightKg : null;
    const d30 =
      old30?.weightKg != null ? last - old30.weightKg : null;
    return { d7, d30 };
  }, [measurements, lastMeas]);

  const waistInfo = useMemo(() => {
    const withW = measurements
      .filter((m) => m.waistCm != null && m.waistCm > 0)
      .sort((a, b) => parseYmd(b.date).getTime() - parseYmd(a.date).getTime());
    const last = withW[0];
    if (!last?.waistCm) return null;
    const cut30 = daysAgoYmd(30);
    const older = withW.find((m) => m.date <= cut30);
    if (!older?.waistCm) return { last: last.waistCm, delta: null as number | null };
    return { last: last.waistCm, delta: last.waistCm - older.waistCm };
  }, [measurements]);

  const workouts7d = useMemo(() => {
    const cut = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return workouts.filter((w) => new Date(w.startedAt).getTime() >= cut).length;
  }, [workouts]);

  const motivation = useMemo(() => {
    const lines: string[] = [];
    if (weightDelta?.d30 != null && weightDelta.d30 < -0.05) {
      lines.push("За месяц вес снижается — хорошая динамика.");
    } else if (weightDelta?.d30 != null && weightDelta.d30 > 0.3) {
      lines.push("Вес за месяц вырос — при необходимости скорректируйте план.");
    }
    if (waistInfo?.delta != null && waistInfo.delta < -0.1) {
      lines.push("Талия уменьшается — прогресс заметен.");
    }
    if (workouts7d >= 3) {
      lines.push("Активная неделя: несколько тренировок — так держать.");
    } else if (workouts7d === 0 && workouts.length > 0) {
      lines.push("На этой неделе ещё не было тренировок — можно запланировать одну.");
    }
    const streakMeas = measurements.length >= 2;
    if (streakMeas && lines.length < 2) {
      lines.push("Регулярные замеры помогают видеть тренды.");
    }
    if (lines.length === 0) {
      lines.push("Фиксируйте замеры и питание — сводка станет информативнее.");
    }
    return lines[0] ?? "";
  }, [weightDelta, waistInfo, workouts7d, workouts.length, measurements.length]);

  const goalK = settings?.bodyKcalGoal;

  return (
    <div className="body-home">
      <p className="screen__text body-home__lead">
        Краткая сводка и динамика. Подробные формы — в разделах ниже.
      </p>
      {err ? <p className="finance__err">{err}</p> : null}
      {pending ? <p className="screen__text">Загрузка…</p> : null}

      {!pending && lastMeas?.weightKg != null ? (
        <section className="body-home__card body-home__card--hero">
          <div className="body-home__card-head">
            <span className="body-home__label">Вес</span>
            <span className="body-home__date">{lastMeas.date}</span>
          </div>
          <p className="body-home__big">
            {formatMass(lastMeas.weightKg, massU)}
          </p>
          {weightDelta && (weightDelta.d7 != null || weightDelta.d30 != null) ? (
            <div className="body-home__deltas">
              {weightDelta.d7 != null ? (
                <span
                  className={
                    weightDelta.d7 <= 0
                      ? "body-home__delta body-home__delta--ok"
                      : "body-home__delta body-home__delta--warn"
                  }
                >
                  7 дн.: {weightDelta.d7 >= 0 ? "+" : ""}
                  {formatMass(weightDelta.d7, massU)}
                </span>
              ) : null}
              {weightDelta.d30 != null ? (
                <span
                  className={
                    weightDelta.d30 <= 0
                      ? "body-home__delta body-home__delta--ok"
                      : "body-home__delta body-home__delta--warn"
                  }
                >
                  30 дн.: {weightDelta.d30 >= 0 ? "+" : ""}
                  {formatMass(weightDelta.d30, massU)}
                </span>
              ) : null}
            </div>
          ) : null}
          <WeightSparkline points={weightSeries} />
        </section>
      ) : !pending ? (
        <section className="body-home__card body-home__card--muted">
          <p className="body-home__muted">
            Нет замеров с весом. Внесите первый замер — здесь появится динамика.
          </p>
        </section>
      ) : null}

      {!pending && waistInfo ? (
        <section className="body-home__row2">
          <div className="body-home__mini">
            <span className="body-home__mini-label">Талия</span>
            <strong>{formatLength(waistInfo.last, lenU)}</strong>
            {waistInfo.delta != null ? (
              <span
                className={
                  waistInfo.delta <= 0
                    ? "body-home__delta body-home__delta--ok"
                    : "body-home__delta body-home__delta--warn"
                }
              >
                30 дн.: {waistInfo.delta >= 0 ? "+" : ""}
                {formatLength(waistInfo.delta, lenU)}
              </span>
            ) : (
              <span className="body-home__hint">мало точек для тренда</span>
            )}
          </div>
          <div className="body-home__mini">
            <span className="body-home__mini-label">Тренировки</span>
            <strong>{workouts7d}</strong>
            <span className="body-home__hint">за 7 дней</span>
          </div>
        </section>
      ) : !pending ? (
        <section className="body-home__row2">
          <div className="body-home__mini body-home__mini--wide">
            <span className="body-home__mini-label">Тренировки</span>
            <strong>{workouts7d}</strong>
            <span className="body-home__hint">за 7 дней</span>
          </div>
        </section>
      ) : null}

      {goalK != null && goalK > 0 ? (
        <section className="body-home__card">
          <div className="body-home__goal-row">
            <span>Ккал сегодня</span>
            <span>
              {todayTotals.kcal} / {goalK}
            </span>
          </div>
          <div
            className="body-panel__goal-bar"
            role="progressbar"
            aria-valuenow={Math.min(100, Math.round((100 * todayTotals.kcal) / goalK))}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${todayTotals.kcal} из ${goalK} килокалорий`}
          >
            <div
              className="body-panel__goal-fill"
              style={{
                width: `${Math.min(100, (100 * todayTotals.kcal) / goalK)}%`,
              }}
            />
          </div>
        </section>
      ) : null}

      <p className="body-home__motivation">{motivation}</p>

      <button
        type="button"
        className="body-home__cta"
        onClick={onOpenMeasurements}
      >
        Замеры и история
      </button>
    </div>
  );
}
