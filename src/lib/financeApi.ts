export type CategoryType = "EXPENSE" | "INCOME" | "BOTH";
export type TransactionKind = "EXPENSE" | "INCOME";

export type Category = {
  id: string;
  name: string;
  type: CategoryType;
  isBuiltIn: boolean;
  isArchived: boolean;
  sortOrder: number;
};

export type TransactionRow = {
  id: string;
  kind: TransactionKind;
  amountMinor: number;
  note: string | null;
  occurredAt: string;
  category: Category;
};

async function json<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
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
  const d = data as { error?: { message?: string } };
  return d?.error?.message ?? "Ошибка запроса";
}
