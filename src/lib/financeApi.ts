export type CategoryType = "EXPENSE" | "INCOME" | "BOTH";
export type TransactionKind = "EXPENSE" | "INCOME";
export type AccountType = "CARD" | "CASH" | "BANK" | "OTHER";
export type InvestmentAssetKind = "STOCK" | "BOND" | "FUND" | "CRYPTO" | "OTHER";

export type Category = {
  id: string;
  name: string;
  type: CategoryType;
  isBuiltIn: boolean;
  isArchived: boolean;
  sortOrder: number;
};

export type AccountRow = {
  id: string;
  name: string;
  type: AccountType;
  sortOrder: number;
  balanceMinor: number;
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

export type InvestmentHoldingRow = {
  id: string;
  name: string;
  assetKind: InvestmentAssetKind;
  units: number;
  pricePerUnitMinor: number;
  valueMinor: number;
  note: string | null;
  updatedAt: string;
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
  const merged: RequestInit = {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
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

export async function createAccount(name: string, type: AccountType) {
  return json<{ account: Omit<AccountRow, "balanceMinor"> }>(
    "/api/v1/finance/accounts",
    {
      method: "POST",
      body: JSON.stringify({ name, type }),
    },
  );
}

export async function deleteAccount(id: string) {
  return json<{ ok: boolean }>(`/api/v1/finance/accounts/${id}`, {
    method: "DELETE",
  });
}

export async function fetchInvestOverview() {
  return json<{
    totalValueMinor: number;
    holdings: InvestmentHoldingRow[];
    metrics: {
      per1000DayMinor: number | null;
      per1000MonthMinor: number | null;
      per1000YearMinor: number | null;
      note: string;
    };
  }>("/api/v1/finance/investments/overview");
}

export async function createHolding(payload: {
  name: string;
  assetKind: InvestmentAssetKind;
  units: number;
  pricePerUnitRub: number;
  note?: string;
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

export async function fetchCategories(includeArchived = false) {
  const q = includeArchived ? "?includeArchived=1" : "";
  return json<{ categories: Category[] }>(`/api/v1/finance/categories${q}`);
}

export async function createCategory(name: string, type: CategoryType) {
  return json<{ category: Category }>("/api/v1/finance/categories", {
    method: "POST",
    body: JSON.stringify({ name, type }),
  });
}

export async function patchCategory(
  id: string,
  body: Partial<{ name: string; isArchived: boolean; type: CategoryType }>,
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

export async function fetchTransactions(from?: string, to?: string) {
  const p =
    from && to
      ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      : "";
  return json<{ transactions: TransactionRow[] }>(
    `/api/v1/finance/transactions${p}`,
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
