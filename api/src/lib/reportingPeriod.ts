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

/**
 * Локальная календарная дата для момента ref при смещении как у Date.getTimezoneOffset()
 * (Москва ≈ −180).
 */
export function getLocalCalendarParts(
  ref: Date,
  tzOffsetMin: number,
): { y: number; m: number; d: number } {
  const shifted = new Date(ref.getTime() - tzOffsetMin * 60000);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
  };
}

/** Начало локального календарного дня (y, m 0..11, d) в UTC. */
export function localDayStartUtc(
  y: number,
  m: number,
  d: number,
  tzOffsetMin: number,
): Date {
  return new Date(Date.UTC(y, m, d, 0, 0, 0, 0) + tzOffsetMin * 60000);
}

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const re = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!re) return null;
  const y = Number(re[1]);
  const mo = Number(re[2]);
  const day = Number(re[3]);
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  return { y, m: mo - 1, d: day };
}

/** CUSTOM: from/to — календарные дни в часовом поясе клиента (YYYY-MM-DD). */
export function getCustomReportingPeriodTz(
  fromStr: string,
  toStr: string,
  tzOffsetMin: number,
): ReportingPeriod {
  const a = parseYmd(fromStr);
  const b = parseYmd(toStr);
  if (!a || !b) {
    return getReportingPeriodContainingTz(1, new Date(), tzOffsetMin);
  }
  const start = localDayStartUtc(a.y, a.m, a.d, tzOffsetMin);
  const endDayStart = localDayStartUtc(b.y, b.m, b.d, tzOffsetMin);
  if (endDayStart.getTime() < start.getTime()) {
    return getCustomReportingPeriodTz(toStr, fromStr, tzOffsetMin);
  }
  const endExclusive = new Date(endDayStart.getTime() + 86400000);
  return { start, endExclusive, lastDayInclusive: endDayStart };
}

/** Как getReportingPeriodContaining, но границы — по локальному календарю клиента. */
export function getReportingPeriodContainingTz(
  reportingDay: number,
  ref: Date,
  tzOffsetMin: number,
): ReportingPeriod {
  const D = clampReportingDay(reportingDay);
  const { y, m, d } = getLocalCalendarParts(ref, tzOffsetMin);

  let start: Date;
  let endExclusive: Date;
  if (d >= D) {
    start = localDayStartUtc(y, m, D, tzOffsetMin);
    endExclusive = localDayStartUtc(y, m + 1, D, tzOffsetMin);
  } else {
    start = localDayStartUtc(y, m - 1, D, tzOffsetMin);
    endExclusive = localDayStartUtc(y, m, D, tzOffsetMin);
  }

  const lastDayInclusive = new Date(endExclusive.getTime() - 86400000);
  return { start, endExclusive, lastDayInclusive };
}

export function getActiveReportingPeriodTz(
  granularity: FinanceReportingGranularity,
  anchorDay: number,
  ref: Date,
  customFromStr: string | null,
  customToStr: string | null,
  tzOffsetMin: number,
): ReportingPeriod {
  if (granularity === "CUSTOM") {
    if (customFromStr && customToStr) {
      return getCustomReportingPeriodTz(customFromStr, customToStr, tzOffsetMin);
    }
    return getReportingPeriodContainingTz(anchorDay, ref, tzOffsetMin);
  }
  if (granularity === "DAY") {
    const { y, m, d } = getLocalCalendarParts(ref, tzOffsetMin);
    const start = localDayStartUtc(y, m, d, tzOffsetMin);
    const endExclusive = new Date(start.getTime() + 86400000);
    return { start, endExclusive, lastDayInclusive: start };
  }
  if (granularity === "WEEK") {
    const { y, m, d } = getLocalCalendarParts(ref, tzOffsetMin);
    const sod = localDayStartUtc(y, m, d, tzOffsetMin);
    const shifted = new Date(sod.getTime() - tzOffsetMin * 60000);
    const dow = shifted.getUTCDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const start = new Date(sod.getTime() + mondayOffset * 86400000);
    const endExclusive = new Date(start.getTime() + 7 * 86400000);
    const lastDayInclusive = new Date(endExclusive.getTime() - 86400000);
    return { start, endExclusive, lastDayInclusive };
  }
  if (granularity === "YEAR") {
    const { y } = getLocalCalendarParts(ref, tzOffsetMin);
    const start = localDayStartUtc(y, 0, 1, tzOffsetMin);
    const endExclusive = localDayStartUtc(y + 1, 0, 1, tzOffsetMin);
    const lastDayInclusive = new Date(endExclusive.getTime() - 86400000);
    return { start, endExclusive, lastDayInclusive };
  }
  return getReportingPeriodContainingTz(anchorDay, ref, tzOffsetMin);
}

/**
 * Диапазон occurredAt для отчёта: от начала периода до верхней границы.
 * При переданном tzOffset (как у Date.getTimezoneOffset()) верхняя граница —
 * конец **локального** календарного дня ref, но не позже конца периода.
 * Так операции с датой «сегодня» (часто сохранённые как полдень UTC) не пропадают
 * из отчёта утром по UTC. Без tz — по-прежнему min(сейчас, конец периода).
 */
export function occurredAtBoundsForReporting(
  period: ReportingPeriod,
  ref: Date,
  tzOffsetMin?: number | null,
): { gte: Date; lte: Date } {
  const lastInPeriodMs = period.endExclusive.getTime() - 1;
  let capMs: number;
  if (tzOffsetMin !== null && tzOffsetMin !== undefined && Number.isFinite(tzOffsetMin)) {
    const { y, m, d } = getLocalCalendarParts(ref, tzOffsetMin);
    const dayStart = localDayStartUtc(y, m, d, tzOffsetMin);
    const endOfLocalDayMs = dayStart.getTime() + 86400000 - 1;
    capMs = Math.min(endOfLocalDayMs, lastInPeriodMs);
  } else {
    capMs = Math.min(ref.getTime(), lastInPeriodMs);
  }
  return { gte: period.start, lte: new Date(capMs) };
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

/** Дней с начала периода по локальному календарю клиента. */
export function daysElapsedInPeriodTz(
  period: ReportingPeriod,
  ref: Date,
  tzOffsetMin: number,
): number {
  const a = getLocalCalendarParts(period.start, tzOffsetMin);
  const b = getLocalCalendarParts(ref, tzOffsetMin);
  const day0 = Date.UTC(a.y, a.m, a.d);
  const day1 = Date.UTC(b.y, b.m, b.d);
  return Math.max(1, Math.floor((day1 - day0) / 86400000) + 1);
}

export function daysRemainingInPeriodTz(
  period: ReportingPeriod,
  ref: Date,
  tzOffsetMin: number,
): number {
  const last = getLocalCalendarParts(period.lastDayInclusive, tzOffsetMin);
  const lastT = Date.UTC(last.y, last.m, last.d);
  const { y, m, d } = getLocalCalendarParts(ref, tzOffsetMin);
  const tomorrowT = Date.UTC(y, m, d + 1);
  if (tomorrowT > lastT) return 0;
  return Math.floor((lastT - tomorrowT) / 86400000) + 1;
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
