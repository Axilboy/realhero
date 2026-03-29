/** Отчётный период: с выбранного числа каждого месяца до дня перед тем же числом следующего месяца (UTC-календарь). */

import type { FinanceReportingGranularity } from "@prisma/client";

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

function startOfUTCDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

function addUTCDays(d: Date, days: number): Date {
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() + days,
      0,
      0,
      0,
      0,
    ),
  );
}

/** Дата YYYY-MM-DD в UTC 00:00. */
export function parseISODateUTC(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  const d = new Date(Date.UTC(y, mo - 1, da, 0, 0, 0, 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Произвольный диапазон: from и to включительно (календарные дни UTC). */
export function getCustomReportingPeriod(
  fromInclusive: Date,
  toInclusive: Date,
): ReportingPeriod {
  const start = startOfUTCDay(fromInclusive);
  const endDay = startOfUTCDay(toInclusive);
  if (endDay.getTime() < start.getTime()) {
    return getCustomReportingPeriod(toInclusive, fromInclusive);
  }
  const endExclusive = addUTCDays(endDay, 1);
  return { start, endExclusive, lastDayInclusive: endDay };
}

/**
 * Текущее окно отчётности по настройке пользователя (UTC).
 * CUSTOM — только если переданы границы; иначе безопасный fallback на месяц с якорем.
 */
export function getActiveReportingPeriod(
  granularity: FinanceReportingGranularity,
  anchorDay: number,
  ref: Date,
  customFrom?: Date | null,
  customToInclusive?: Date | null,
): ReportingPeriod {
  if (granularity === "CUSTOM") {
    if (
      customFrom &&
      customToInclusive &&
      !Number.isNaN(customFrom.getTime()) &&
      !Number.isNaN(customToInclusive.getTime())
    ) {
      return getCustomReportingPeriod(customFrom, customToInclusive);
    }
    return getReportingPeriodContaining(anchorDay, ref);
  }
  if (granularity === "DAY") {
    const start = startOfUTCDay(ref);
    const endExclusive = addUTCDays(start, 1);
    return { start, endExclusive, lastDayInclusive: start };
  }
  if (granularity === "WEEK") {
    const sod = startOfUTCDay(ref);
    const dow = sod.getUTCDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const start = addUTCDays(sod, mondayOffset);
    const endExclusive = addUTCDays(start, 7);
    const lastDayInclusive = addUTCDays(start, 6);
    return { start, endExclusive, lastDayInclusive };
  }
  if (granularity === "YEAR") {
    const y = ref.getUTCFullYear();
    const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
    const endExclusive = new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0, 0));
    const lastDayInclusive = new Date(Date.UTC(y, 11, 31, 0, 0, 0, 0));
    return { start, endExclusive, lastDayInclusive };
  }
  return getReportingPeriodContaining(anchorDay, ref);
}

/** Календарных дней в периоде (от начала до последнего дня включительно). */
export function totalCalendarDaysInPeriod(period: ReportingPeriod): number {
  const a = Date.UTC(
    period.start.getUTCFullYear(),
    period.start.getUTCMonth(),
    period.start.getUTCDate(),
  );
  const b = Date.UTC(
    period.lastDayInclusive.getUTCFullYear(),
    period.lastDayInclusive.getUTCMonth(),
    period.lastDayInclusive.getUTCDate(),
  );
  return Math.max(1, Math.floor((b - a) / 86400000) + 1);
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
