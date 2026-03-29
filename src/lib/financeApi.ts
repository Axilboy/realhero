import { getRhAccessToken } from "./authToken";

export type CategoryType = "EXPENSE" | "INCOME" | "BOTH";
export type TransactionKind = "EXPENSE" | "INCOME";
export type AccountType =
  | "CARD"
  | "DEBIT_CARD"
  | "CREDIT_CARD"
  | "CASH"
  | "BANK"
  | "DEPOSIT"
  | "SAVINGS"
  | "OTHER";
export type InvestmentAssetKind = "STOCK" | "BOND" | "FUND" | "CRYPTO" | "OTHER";

export type Category = {
  id: string;
  name: string;
  type: CategoryType;
  isBuiltIn: boolean;
  isArchived: boolean;
  sortOrder: number;
  /** Служебные категории (корректировка баланса) не входят в отчётные доходы/расходы. */
  excludeFromReporting?: boolean;
  parentId?: string | null;
  iconEmoji?: string | null;
  accentColor?: string | null;
};

/** Системная категория, если пользователь не выбрал другую. */
export const UNCATEGORIZED_CATEGORY_NAME = "Без категории";

export type AccountRow = {
  id: string;
  name: string;
  type: AccountType;
  sortOrder: number;
  balanceMinor: number;
  annualInterestPercent: number | null;
  /** Оценка дохода по ставке за месяц, коп. (вклады/накопительные / счёт с %). */
  interestIncomeMonthMinor: number;
  /** Оценка дохода по ставке за год, коп. */
  interestIncomeYearMinor: number;
  /** Оценка дохода по ставке за день (год/365), коп. */
  interestIncomeDayMinor: number;
};

export type TransactionAccount = {
  id: string;
  name: string;
  type: AccountType;
} | null;

export type TransactionRow = {
  id: string;
  kind: TransactionKind;
  amountMinor: number;
  note: string | null;
  occurredAt: string;
  category: Category;
  account: TransactionAccount;
};

export type TransferRow = {
  id: string;
  amountMinor: number;
  note: string | null;
  occurredAt: string;
  fromAccountId: string;
  toAccountId: string;
  fromAccount: { id: string; name: string; type: AccountType };
  toAccount: { id: string; name: string; type: AccountType };
};

export type InvestmentHoldingRow = {
  id: string;
  name: string;
  assetKind: InvestmentAssetKind;
  units: number;
  pricePerUnitMinor: number;
  valueMinor: number;
  /** Годовой купон/див с одной бумаги, коп. */
  annualIncomePerUnitMinor: number | null;
  /** Legacy: годовой доход на всю позицию, коп. */
  annualCouponDividendMinor: number | null;
  /** Итого по позиции (per-unit×units или legacy), коп/год */
  annualCashflowTotalMinor: number;
  quoteSource: string | null;
  quoteExternalId: string | null;
  quoteMoexMarket: string | null;
  note: string | null;
  updatedAt: string;
};

export type InvestAllocation = {
  totalWealthMinor: number;
  /** Сумма сегментов долей (без карт и прочих счётов вне разбиения). */
  portfolioSplitMinor: number;
  depositsMinor: number;
  savingsMinor: number;
  stocksMinor: number;
  bondsMinor: number;
  otherInstrumentsMinor: number;
  pctDeposits: number;
  pctSavings: number;
  pctStocks: number;
  pctBonds: number;
  pctOtherInstruments: number;
};

export type DepositSavingsAccountRow = {
  id: string;
  name: string;
  type: AccountType;
  balanceMinor: number;
  annualInterestPercent: number | null;
  interestIncomeMonthMinor: number;
  interestIncomeYearMinor: number;
  interestIncomeDayMinor: number;
};

/** Абсолютный URL к API (надёжнее для cookie при нестандартном base / PWA). */
export function resolveApiUrl(path: string): string {
  if (path.startsWith("http")) return path;
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).href;
}

let refreshSession: (() => Promise<void>) | null = null;

/** Вызывать из AuthProvider: при 401 повторим запрос после обновления сессии. */
export function bindFinanceAuthRefresh(fn: () => Promise<void>): void {
  refreshSession = fn;
}

async function financeFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = resolveApiUrl(path);
  const hasBody = init?.body != null;
  const bearer = getRhAccessToken();
  const merged: RequestInit = {
    ...init,
    credentials: "include",
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(init?.headers ?? {}),
    },
  };
  const doReq = () => fetch(url, { ...merged, body: init?.body });
  let res = await doReq();
  if (res.status === 401 && refreshSession) {
    try {
      await refreshSession();
    } catch {
      /* ignore */
    }
    res = await doReq();
  }
  return res;
}

async function json<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await financeFetch(path, init);
  const text = await res.text();
  let data = {} as T;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      if (!res.ok) {
        data = {
          error: {
            message:
              text.length > 200 ? `${text.slice(0, 200)}…` : text || res.statusText,
          },
        } as T;
      }
    }
  } else if (!res.ok) {
    data = { error: { message: res.statusText || `HTTP ${res.status}` } } as T;
  }
  return { ok: res.ok, status: res.status, data };
}

export async function fetchAccounts() {
  return json<{
    accounts: AccountRow[];
    investmentsTotalMinor: number;
  }>("/api/v1/finance/accounts");
}

export async function createAccount(payload: {
  name: string;
  type: AccountType;
  annualInterestPercent?: number | null;
}) {
  return json<{ account: Omit<AccountRow, "balanceMinor" | "interestIncomeMonthMinor"> }>(
    "/api/v1/finance/accounts",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function patchAccount(
  id: string,
  body: Partial<{
    name: string;
    type: AccountType;
    annualInterestPercent: number | null;
    sortOrder: number;
  }>,
) {
  return json<{ account: Omit<AccountRow, "balanceMinor" | "interestIncomeMonthMinor"> }>(
    `/api/v1/finance/accounts/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export async function deleteAccount(id: string) {
  return json<{ ok: boolean }>(`/api/v1/finance/accounts/${id}`, {
    method: "DELETE",
  });
}

/** Удалить счёт вместе со всеми операциями и переводами (без переноса). */
export async function purgeAccount(id: string) {
  return json<{ ok: boolean }>(`/api/v1/finance/accounts/${id}/purge`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** Перенести операции и переводы на другой счёт и удалить счёт. */
export async function mergeAccountInto(id: string, targetAccountId: string) {
  return json<{ ok: boolean }>(`/api/v1/finance/accounts/${id}/merge-into`, {
    method: "POST",
    body: JSON.stringify({ targetAccountId }),
  });
}

export type FinanceReportingGranularity =
  | "DAY"
  | "WEEK"
  | "MONTH"
  | "YEAR"
  | "CUSTOM";

export async function fetchFinanceSettings() {
  return json<{
    financeReportingDay: number;
    financeReportingGranularity: FinanceReportingGranularity;
    financeReportingCustomFrom: string | null;
    financeReportingCustomTo: string | null;
  }>("/api/v1/finance/settings");
}

export async function patchFinanceSettings(body: {
  financeReportingDay?: number;
  financeReportingGranularity?: FinanceReportingGranularity;
  financeReportingCustomFrom?: string | null;
  financeReportingCustomTo?: string | null;
}) {
  return json<{
    financeReportingDay: number;
    financeReportingGranularity: FinanceReportingGranularity;
    financeReportingCustomFrom: string | null;
    financeReportingCustomTo: string | null;
  }>("/api/v1/finance/settings", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function fetchReportingSummary(opts?: {
  from?: string;
  to?: string;
}) {
  const sp = new URLSearchParams();
  if (opts?.from) sp.set("from", opts.from);
  if (opts?.to) sp.set("to", opts.to);
  sp.set("tzOffset", String(new Date().getTimezoneOffset()));
  const q = sp.toString();
  return json<{
    financeReportingDay: number;
    financeReportingGranularity: FinanceReportingGranularity;
    periodStart: string;
    periodEndExclusive: string;
    periodLastDay: string;
    incomeMinor: number;
    expenseMinor: number;
    /** Сумма исходящих переводов за период (не входит в balanceMinor). */
    transferOutMinor: number;
    /** Расходы по категориям + переводы (отток денег за период). */
    outflowMinor: number;
    balanceMinor: number;
  }>(`/api/v1/finance/summary/reporting${q ? `?${q}` : ""}`);
}

export type ReportingForecast = {
  financeReportingDay: number;
  financeReportingGranularity: FinanceReportingGranularity;
  periodStart: string;
  periodEndExclusive: string;
  periodLastDay: string;
  nextReportingDay: string;
  /** Календарных дней в отчётном периоде (целиком). */
  totalDaysInPeriod: number;
  daysElapsed: number;
  daysRemaining: number;
  incomeMinor: number;
  expenseMinor: number;
  realizedNetMinor: number;
  avgDailyIncomeMinor: number;
  avgDailyExpenseMinor: number;
  avgDailyNetMinor: number;
  /** Линейный прогноз (старый расчёт). */
  projectedNetEndMinor: number;
  /** Пассивный доход до конца периода (оценка). */
  passiveIncomeToEndMinor: number;
  /** Расходы за весь период по среднему дневному. */
  expenseProjectedPeriodMinor: number;
  /** Доход за период + пассив до конца − прогноз расходов на весь период. */
  expectedBalanceIndicatorMinor: number;
};

export async function fetchReportingForecast(opts?: {
  from?: string;
  to?: string;
}) {
  const q = new URLSearchParams();
  if (opts?.from) q.set("from", opts.from);
  if (opts?.to) q.set("to", opts.to);
  q.set("tzOffset", String(new Date().getTimezoneOffset()));
  const qs = q.toString();
  return json<ReportingForecast>(
    `/api/v1/finance/analytics/reporting-forecast${qs ? `?${qs}` : ""}`,
  );
}

export type BudgetLine = {
  categoryId: string;
  name: string;
  limitMinor: number | null;
  spentMinor: number;
  remainingMinor: number | null;
};

export type BudgetTotals = {
  limitTotalMinor: number;
  spentInBudgetMinor: number;
  remainingTotalMinor: number;
};

export type BudgetSummary = {
  periodYm: string;
  hasBudgets: boolean;
  limitTotalMinor: number;
  spentInBudgetMinor: number;
  remainingTotalMinor: number;
};

export async function fetchBudget(periodYm?: string) {
  const q = periodYm
    ? `?periodYm=${encodeURIComponent(periodYm)}`
    : "";
  return json<{
    periodYm: string;
    lines: BudgetLine[];
    totals: BudgetTotals;
  }>(`/api/v1/finance/budget${q}`);
}

export async function fetchBudgetSummary(periodYm?: string) {
  const q = periodYm
    ? `?periodYm=${encodeURIComponent(periodYm)}`
    : "";
  return json<BudgetSummary>(`/api/v1/finance/budget/summary${q}`);
}

export async function putBudgetLine(payload: {
  categoryId: string;
  periodYm: string;
  /** null — снять лимит (коп.) */
  limitMinor: number | null;
}) {
  return json<{ ok: boolean }>("/api/v1/finance/budget", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchInvestOverview(refreshQuotes?: boolean) {
  const q =
    refreshQuotes === true ? "?refresh=1" : "";
  return json<{
    totalValueMinor: number;
    holdings: InvestmentHoldingRow[];
    depositSavingsAccounts: DepositSavingsAccountRow[];
    metrics: {
      incomePer1000YearMinor: number | null;
      couponDividendDayMinor: number | null;
      couponDividendMonthMinor: number | null;
      couponDividendYearMinor: number | null;
      depositSavingsIncomeMonthMinor: number;
      note: string;
    };
    allocation: InvestAllocation;
  }>(`/api/v1/finance/investments/overview${q}`);
}

export async function createHolding(payload: {
  name: string;
  assetKind: InvestmentAssetKind;
  units: number;
  pricePerUnitRub: number;
  note?: string;
  /** Legacy: купоны + дивиденды на всю позицию за год, ₽ */
  annualCouponDividendRub?: number | null;
  /** Купон/див с одной бумаги в год, ₽ */
  annualIncomePerUnitRub?: number | null;
  /** С одной бумаги в месяц, ₽ (в БД хранится как годовой ×12) */
  monthlyIncomePerUnitRub?: number | null;
  quoteSource?: string | null;
  quoteExternalId?: string | null;
  quoteMoexMarket?: string | null;
}) {
  return json<{ holding: InvestmentHoldingRow }>(
    "/api/v1/finance/investments/holdings",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function patchHolding(
  id: string,
  body: Partial<{
    units: number;
    pricePerUnitRub: number;
    name: string;
    note: string | null;
    annualCouponDividendRub: number | null;
    annualIncomePerUnitRub: number | null;
    monthlyIncomePerUnitRub: number | null;
  }>,
) {
  return json<{ holding: InvestmentHoldingRow }>(
    `/api/v1/finance/investments/holdings/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export async function createTransfer(payload: {
  fromAccountId: string;
  toAccountId: string;
  amountRub: number;
  note?: string;
  occurredAt?: string;
}) {
  return json<{ transfer: { id: string } }>("/api/v1/finance/transfers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteHolding(id: string) {
  return json<{ ok: boolean }>(`/api/v1/finance/investments/holdings/${id}`, {
    method: "DELETE",
  });
}

export type QuoteSearchHit = {
  source: "coingecko" | "moex";
  externalId: string;
  name: string;
  symbol: string;
  assetKind: InvestmentAssetKind;
  moexMarket?: "shares" | "bonds";
};

export async function searchInvestQuotes(q: string) {
  return json<{ results: QuoteSearchHit[] }>(
    `/api/v1/finance/investments/quote-search?q=${encodeURIComponent(q)}`,
    { method: "GET" },
  );
}

export async function fetchQuoteFundamentals(params: {
  source: "coingecko" | "moex";
  id: string;
  assetKind: InvestmentAssetKind;
  moexMarket?: "shares" | "bonds";
}) {
  const sp = new URLSearchParams({
    source: params.source,
    id: params.id,
    assetKind: params.assetKind,
  });
  if (params.moexMarket) sp.set("moexMarket", params.moexMarket);
  return json<{
    annualIncomePerUnitRub: number | null;
    note: string | null;
  }>(`/api/v1/finance/investments/quote-fundamentals?${sp}`, {
    method: "GET",
  });
}

export async function fetchInvestQuotePrice(params: {
  source: "coingecko" | "moex";
  id: string;
  date?: string;
  /** Порядок опроса рынков MOEX при котировке. */
  moexMarket?: "shares" | "bonds" | "auto";
}) {
  const sp = new URLSearchParams({
    source: params.source,
    id: params.id,
  });
  if (params.date) sp.set("date", params.date);
  if (params.source === "moex" && params.moexMarket && params.moexMarket !== "auto") {
    sp.set("moexMarket", params.moexMarket);
  }
  return json<{
    priceRub: number;
    asOf: string | null;
    note: string | null;
  }>(`/api/v1/finance/investments/quote-price?${sp}`, { method: "GET" });
}

export async function fetchCategories(includeArchived = false) {
  const q = includeArchived ? "?includeArchived=1" : "";
  return json<{ categories: Category[] }>(`/api/v1/finance/categories${q}`);
}

export type CreateCategoryPayload = {
  name: string;
  type: CategoryType;
  parentId?: string | null;
  iconEmoji?: string | null;
  accentColor?: string | null;
};

export async function createCategory(
  nameOrPayload: string | CreateCategoryPayload,
  typeArg?: CategoryType,
) {
  const payload: CreateCategoryPayload =
    typeof nameOrPayload === "string"
      ? { name: nameOrPayload, type: typeArg! }
      : nameOrPayload;
  return json<{ category: Category }>("/api/v1/finance/categories", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchCategory(
  id: string,
  body: Partial<{
    name: string;
    isArchived: boolean;
    type: CategoryType;
    iconEmoji: string | null;
    accentColor: string | null;
  }>,
) {
  return json<{ category: Category }>(`/api/v1/finance/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function fetchSummary(monthYm: string) {
  return json<{
    month: string;
    incomeMinor: number;
    expenseMinor: number;
    balanceMinor: number;
  }>(`/api/v1/finance/summary?month=${encodeURIComponent(monthYm)}`);
}

export async function fetchSummaryByCategory(monthYm: string) {
  return json<{
    month: string;
    expenses: { categoryId: string; categoryName: string; amountMinor: number }[];
    incomes: { categoryId: string; categoryName: string; amountMinor: number }[];
  }>(
    `/api/v1/finance/summary/by-category?month=${encodeURIComponent(monthYm)}`,
  );
}

export async function fetchTransactions(opts?: {
  from?: string;
  to?: string;
  accountId?: string;
}) {
  const sp = new URLSearchParams();
  if (opts?.from) sp.set("from", opts.from);
  if (opts?.to) sp.set("to", opts.to);
  if (opts?.accountId) sp.set("accountId", opts.accountId);
  const q = sp.toString();
  return json<{ transactions: TransactionRow[] }>(
    `/api/v1/finance/transactions${q ? `?${q}` : ""}`,
  );
}

export async function fetchTransfers(opts?: { accountId?: string }) {
  const sp = new URLSearchParams();
  if (opts?.accountId) sp.set("accountId", opts.accountId);
  const q = sp.toString();
  return json<{ transfers: TransferRow[] }>(
    `/api/v1/finance/transfers${q ? `?${q}` : ""}`,
  );
}

export async function createTransaction(payload: {
  accountId?: string;
  categoryId: string;
  kind: TransactionKind;
  amountRub: number;
  note?: string;
  occurredAt?: string;
}) {
  return json<{ transaction: TransactionRow }>(
    "/api/v1/finance/transactions",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteTransaction(id: string) {
  return json<{ ok: boolean }>(`/api/v1/finance/transactions/${id}`, {
    method: "DELETE",
  });
}

export function errorMessage(data: unknown): string {
  const d = data as {
    error?: { message?: string } | string;
    message?: string;
  };
  if (typeof d?.error === "string") {
    if (d.error === "Unauthorized")
      return "Сессия истекла — войдите снова";
    return d.error;
  }
  if (d?.error && typeof d.error === "object" && "message" in d.error) {
    const m = (d.error as { message?: string }).message;
    if (m) return m;
  }
  if (typeof d?.message === "string") return d.message;
  return "Ошибка запроса";
}
