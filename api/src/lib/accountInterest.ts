import type { AccountType } from "@prisma/client";

export function coerceAnnualPercent(
  annualPercent: number | null | undefined,
): number | null {
  if (annualPercent == null) return null;
  const p = Number(annualPercent);
  if (!Number.isFinite(p) || p <= 0) return null;
  return p;
}

export function accountUsesInterestRate(a: {
  type: AccountType;
  annualInterestPercent: number | null;
}): boolean {
  if (a.type === "DEPOSIT" || a.type === "SAVINGS") return true;
  if (
    (a.type === "BANK" || a.type === "CREDIT_CARD") &&
    coerceAnnualPercent(a.annualInterestPercent) != null
  )
    return true;
  return false;
}

/**
 * Оценка по ставке за месяц, коп.
 * Вклады/накопительные/счёт: доход при положительном балансе.
 * Кредитка и счёт BANK с отрицательным балансом (долг): отрицательное значение (оценка расхода на %%).
 */
export function interestIncomeMonthMinor(
  balanceMinor: number,
  annualPercent: number | null | undefined,
  accountType: AccountType,
): number {
  const p = coerceAnnualPercent(annualPercent);
  if (p == null) return 0;

  if (accountType === "CREDIT_CARD" || accountType === "BANK") {
    if (balanceMinor < 0) {
      const debt = Math.abs(balanceMinor);
      return -Math.round((debt * p) / 100 / 12);
    }
    if (balanceMinor > 0) {
      return Math.round((balanceMinor * p) / 100 / 12);
    }
    return 0;
  }

  if (balanceMinor <= 0) return 0;
  return Math.round((balanceMinor * p) / 100 / 12);
}

/** Оценка по ставке за год, коп. (долг по кредитке/счёту — отрицательная, расход). */
export function interestIncomeYearMinor(
  balanceMinor: number,
  annualPercent: number | null | undefined,
  accountType: AccountType,
): number {
  const p = coerceAnnualPercent(annualPercent);
  if (p == null) return 0;

  if (accountType === "CREDIT_CARD" || accountType === "BANK") {
    if (balanceMinor < 0) {
      const debt = Math.abs(balanceMinor);
      return -Math.round((debt * p) / 100);
    }
    if (balanceMinor > 0) {
      return Math.round((balanceMinor * p) / 100);
    }
    return 0;
  }

  if (balanceMinor <= 0) return 0;
  return Math.round((balanceMinor * p) / 100);
}

/** Одна календарная ночь Europe/London: годовой поток / 365, коп. (знак как у года). */
export function dailyInterestAccrualMinor(
  balanceMinor: number,
  annualPercent: number | null | undefined,
  accountType: AccountType,
): number {
  const y = interestIncomeYearMinor(balanceMinor, annualPercent, accountType);
  if (y === 0) return 0;
  return Math.round(y / 365);
}
