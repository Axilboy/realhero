/** Отчётный период: с выбранного числа каждого месяца до дня перед тем же числом следующего месяца (UTC-календарь). */

export function clampReportingDay(raw: number): number {
  if (!Number.isFinite(raw)) return 1;
  const d = Math.floor(raw);
  if (d < 1) return 1;
  if (d > 28) return 28;
  return d;
}

export type ReportingPeriod = {
  /** Начало периода 00:00 UTC */
  start: Date;
  /** Следующая граница (исключая), конец текущего периода */
  endExclusive: Date;
  /** Последний календарный день периода (для подписей) */
  lastDayInclusive: Date;
};

export function getReportingPeriodContaining(
  reportingDay: number,
  ref: Date,
): ReportingPeriod {
  const D = clampReportingDay(reportingDay);
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const d = ref.getUTCDate();

  let start: Date;
  let endExclusive: Date;
  if (d >= D) {
    start = new Date(Date.UTC(y, m, D, 0, 0, 0, 0));
    endExclusive = new Date(Date.UTC(y, m + 1, D, 0, 0, 0, 0));
  } else {
    start = new Date(Date.UTC(y, m - 1, D, 0, 0, 0, 0));
    endExclusive = new Date(Date.UTC(y, m, D, 0, 0, 0, 0));
  }

  const lastDayInclusive = new Date(endExclusive.getTime() - 86400000);
  return { start, endExclusive, lastDayInclusive };
}

/** Дней с начала периода по ref (включительно), минимум 1. */
export function daysElapsedInPeriod(period: ReportingPeriod, ref: Date): number {
  const a = Date.UTC(
    period.start.getUTCFullYear(),
    period.start.getUTCMonth(),
    period.start.getUTCDate(),
  );
  const b = Date.UTC(
    ref.getUTCFullYear(),
    ref.getUTCMonth(),
    ref.getUTCDate(),
  );
  return Math.max(1, Math.floor((b - a) / 86400000) + 1);
}

/** Полных календарных дней от завтра до lastDayInclusive включительно. */
export function daysRemainingInPeriod(
  period: ReportingPeriod,
  ref: Date,
): number {
  const tomorrow = new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() + 1),
  );
  const last = Date.UTC(
    period.lastDayInclusive.getUTCFullYear(),
    period.lastDayInclusive.getUTCMonth(),
    period.lastDayInclusive.getUTCDate(),
  );
  const t = Date.UTC(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth(),
    tomorrow.getUTCDate(),
  );
  if (t > last) return 0;
  return Math.floor((last - t) / 86400000) + 1;
}
