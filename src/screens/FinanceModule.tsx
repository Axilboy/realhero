import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type TouchEvent,
} from "react";
import { createPortal } from "react-dom";
import InvestQuotePicker from "../components/InvestQuotePicker";

function modalPortal(node: ReactNode) {
  return createPortal(node, document.body);
}
import {
  createAccount,
  createCategory,
  createHolding,
  createTransaction,
  createTransfer,
  deleteAccount,
  deleteHolding,
  deleteTransaction,
  errorMessage,
  fetchAccounts,
  fetchCategories,
  fetchInvestOverview,
  fetchSummary,
  fetchSummaryByCategory,
  fetchTransactions,
  patchCategory,
  patchHolding,
  type AccountRow,
  type AccountType,
  type Category,
  type InvestmentAssetKind,
  type InvestmentHoldingRow,
  type TransactionKind,
  type TransactionRow,
} from "../lib/financeApi";
import { currentMonthYm, formatRubFromMinor } from "../lib/money";

const TYPE_LABEL: Record<string, string> = {
  EXPENSE: "Расход",
  INCOME: "Доход",
  BOTH: "Оба",
};

const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  CARD: "Карта",
  CASH: "Наличные",
  BANK: "Счёт",
  OTHER: "Другое",
};

const ASSET_LABEL: Record<InvestmentAssetKind, string> = {
  STOCK: "Акция",
  BOND: "Облигация",
  FUND: "Фонд",
  CRYPTO: "Крипто",
  OTHER: "Другое",
};

const ANALYTICS_CHIPS = [
  { icon: "📊", label: "Категории" },
  { icon: "📅", label: "Календарь" },
  { icon: "🏷️", label: "Теги" },
  { icon: "📈", label: "Тренд" },
];

const ADD_OP_TABS = [
  { key: "expense", label: "Расходы" },
  { key: "income", label: "Доходы" },
  { key: "transfer", label: "Перевод" },
  { key: "debt", label: "Долг" },
  { key: "invest", label: "Инвестиции" },
] as const;

type AddOpTab = (typeof ADD_OP_TABS)[number]["key"];

function categoryOptionsForKind(cats: Category[], kind: TransactionKind) {
  return cats.filter(
    (c) => !c.isArchived && (c.type === kind || c.type === "BOTH"),
  );
}

type TabKey = 0 | 1 | 2;

export default function FinanceModule() {
  const [tab, setTab] = useState<TabKey>(0);
  const touchY0 = useRef<number | null>(null);
  const [bump, setBump] = useState(0);
  const refreshAll = useCallback(() => setBump((x) => x + 1), []);

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    touchY0.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    const y0 = touchY0.current;
    touchY0.current = null;
    if (y0 === null) return;
    const dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dy) < 56) return;
    if (dy < 0) setTab((t) => (t < 2 ? ((t + 1) as TabKey) : t));
    else setTab((t) => (t > 0 ? ((t - 1) as TabKey) : t));
  };

  return (
    <div className="finance-mod">
      <div className="finance-mod__head">
        <h1 className="screen__title">Финансы</h1>
      </div>

      <div
        className="finance-mod__swipe"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="finance-mod__track"
          style={{ transform: `translateY(-${(tab * 100) / 3}%)` }}
        >
          <div className="finance-mod__panel">
            <FinanceMainPanel bump={bump} onRefresh={refreshAll} />
          </div>
          <div className="finance-mod__panel">
            <FinanceInvestPanel bump={bump} />
          </div>
          <div className="finance-mod__panel">
            <FinanceAnalyticsPanel bump={bump} />
          </div>
        </div>
      </div>

      <nav className="finance-mod__subnav" aria-label="Разделы финансов">
        {(
          [
            ["Главный", 0],
            ["Инвестиции", 1],
            ["Аналитика", 2],
          ] as const
        ).map(([label, i]) => (
          <button
            key={label}
            type="button"
            className={
              tab === i
                ? "finance-mod__subbtn finance-mod__subbtn--on"
                : "finance-mod__subbtn"
            }
            onClick={() => setTab(i as TabKey)}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function FinanceMainPanel({
  bump,
  onRefresh,
}: {
  bump: number;
  onRefresh: () => void;
}) {
  const [month, setMonth] = useState(currentMonthYm);
  const [summary, setSummary] = useState<{
    incomeMinor: number;
    expenseMinor: number;
    balanceMinor: number;
  } | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [investmentsTotal, setInvestmentsTotal] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);

  const [addOpOpen, setAddOpOpen] = useState(false);
  const [opTab, setOpTab] = useState<AddOpTab>("expense");
  const [amountStr, setAmountStr] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [occurredDate, setOccurredDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);

  const [invHoldings, setInvHoldings] = useState<InvestmentHoldingRow[]>([]);
  const [invMode, setInvMode] = useState<"new" | "add">("new");
  const [invHoldingId, setInvHoldingId] = useState("");
  const [invName, setInvName] = useState("");
  const [invAssetKind, setInvAssetKind] =
    useState<InvestmentAssetKind>("STOCK");
  const [invUnitsStr, setInvUnitsStr] = useState("");
  const [invPriceStr, setInvPriceStr] = useState("");

  const [catModal, setCatModal] = useState(false);
  const [catIncludeArchived, setCatIncludeArchived] = useState(false);
  const [modalCategories, setModalCategories] = useState<Category[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<"EXPENSE" | "INCOME" | "BOTH">(
    "EXPENSE",
  );
  const [catBusy, setCatBusy] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  const [accModal, setAccModal] = useState(false);
  const [newAccName, setNewAccName] = useState("");
  const [newAccType, setNewAccType] = useState<AccountType>("CARD");
  const [accBusy, setAccBusy] = useState(false);
  const [accError, setAccError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    setPending(true);
    const [s, c, t, a] = await Promise.all([
      fetchSummary(month),
      fetchCategories(false),
      fetchTransactions(),
      fetchAccounts(),
    ]);
    setPending(false);
    if (!s.ok) {
      setLoadError(errorMessage(s.data));
      return;
    }
    if (!c.ok) {
      setLoadError(errorMessage(c.data));
      return;
    }
    if (!t.ok) {
      setLoadError(errorMessage(t.data));
      return;
    }
    if (!a.ok) {
      setLoadError(errorMessage(a.data));
      return;
    }
    setSummary({
      incomeMinor: s.data.incomeMinor,
      expenseMinor: s.data.expenseMinor,
      balanceMinor: s.data.balanceMinor,
    });
    setCategories(c.data.categories);
    setTransactions(t.data.transactions);
    setAccounts(a.data.accounts);
    setInvestmentsTotal(a.data.investmentsTotalMinor);
    const first = a.data.accounts[0]?.id ?? "";
    const second = a.data.accounts[1]?.id ?? first;
    setAccountId((prev) =>
      a.data.accounts.some((x) => x.id === prev) ? prev : first,
    );
    setFromAccountId((prev) =>
      a.data.accounts.some((x) => x.id === prev) ? prev : first,
    );
    setToAccountId((prev) =>
      a.data.accounts.some((x) => x.id === prev) ? prev : second,
    );
  }, [month]);

  useEffect(() => {
    void refresh();
  }, [refresh, bump]);

  useEffect(() => {
    if (!catModal) return;
    void (async () => {
      const r = await fetchCategories(catIncludeArchived);
      if (r.ok) setModalCategories(r.data.categories);
    })();
  }, [catModal, catIncludeArchived]);

  const txKindForTab: TransactionKind =
    opTab === "income" ? "INCOME" : "EXPENSE";
  const pickable =
    opTab === "expense" || opTab === "income"
      ? categoryOptionsForKind(categories, txKindForTab)
      : [];
  useEffect(() => {
    if (opTab !== "expense" && opTab !== "income") return;
    if (pickable.length && !pickable.some((c) => c.id === categoryId)) {
      setCategoryId(pickable[0]?.id ?? "");
    }
  }, [pickable, categoryId, opTab]);

  useEffect(() => {
    if (!addOpOpen || opTab !== "invest") return;
    void (async () => {
      const r = await fetchInvestOverview();
      if (r.ok) {
        setInvHoldings(r.data.holdings);
        const first = r.data.holdings[0]?.id ?? "";
        setInvHoldingId((prev) =>
          r.data.holdings.some((h) => h.id === prev) ? prev : first,
        );
      }
    })();
  }, [addOpOpen, opTab]);

  const accountsTotalMinor = accounts.reduce(
    (s, a) => s + a.balanceMinor,
    0,
  );
  const grandTotalMinor = accountsTotalMinor + investmentsTotal;

  function openAddOp() {
    setFormError(null);
    setOpTab("expense");
    setAmountStr("");
    setNote("");
    setOccurredDate(new Date().toISOString().slice(0, 10));
    const first = accounts[0]?.id ?? "";
    const second = accounts[1]?.id ?? first;
    setAccountId(first);
    setFromAccountId(first);
    setToAccountId(second !== first ? second : first);
    setInvMode("new");
    setInvName("");
    setInvUnitsStr("");
    setInvPriceStr("");
    setInvAssetKind("STOCK");
    setAddOpOpen(true);
  }

  async function onSubmitAddOp(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (opTab === "debt") {
      setFormError("Раздел «Долг» скоро появится");
      return;
    }

    if (opTab === "expense" || opTab === "income") {
      const amountRub = Number(String(amountStr).replace(",", "."));
      if (!Number.isFinite(amountRub) || amountRub <= 0) {
        setFormError("Введите сумму больше нуля");
        return;
      }
      if (!categoryId) {
        setFormError("Выберите категорию");
        return;
      }
      setFormBusy(true);
      const res = await createTransaction({
        accountId: accountId || undefined,
        categoryId,
        kind: txKindForTab,
        amountRub,
        note: note.trim() || undefined,
        occurredAt: `${occurredDate}T12:00:00.000Z`,
      });
      setFormBusy(false);
      if (!res.ok) {
        setFormError(errorMessage(res.data));
        return;
      }
    } else if (opTab === "transfer") {
      const amountRub = Number(String(amountStr).replace(",", "."));
      if (!Number.isFinite(amountRub) || amountRub <= 0) {
        setFormError("Введите сумму перевода");
        return;
      }
      if (fromAccountId === toAccountId) {
        setFormError("Выберите разные счета");
        return;
      }
      setFormBusy(true);
      const res = await createTransfer({
        fromAccountId,
        toAccountId,
        amountRub,
        note: note.trim() || undefined,
        occurredAt: `${occurredDate}T12:00:00.000Z`,
      });
      setFormBusy(false);
      if (!res.ok) {
        setFormError(errorMessage(res.data));
        return;
      }
    } else if (opTab === "invest") {
      const units = Number(String(invUnitsStr).replace(",", "."));
      const price = Number(String(invPriceStr).replace(",", "."));
      if (!Number.isFinite(units) || units <= 0) {
        setFormError("Укажите количество");
        return;
      }
      if (!Number.isFinite(price) || price <= 0) {
        setFormError("Укажите цену за единицу (₽)");
        return;
      }
      setFormBusy(true);
      if (invMode === "new") {
        const name = invName.trim();
        if (!name) {
          setFormBusy(false);
          setFormError("Название актива");
          return;
        }
        const res = await createHolding({
          name,
          assetKind: invAssetKind,
          units,
          pricePerUnitRub: price,
        });
        setFormBusy(false);
        if (!res.ok) {
          setFormError(errorMessage(res.data));
          return;
        }
      } else {
        const h = invHoldings.find((x) => x.id === invHoldingId);
        if (!h) {
          setFormBusy(false);
          setFormError("Выберите позицию");
          return;
        }
        const oldVal = h.units * h.pricePerUnitMinor;
        const addVal = units * Math.round(price * 100);
        const newU = h.units + units;
        const newPpm = Math.max(1, Math.round((oldVal + addVal) / newU));
        const res = await patchHolding(h.id, {
          units: newU,
          pricePerUnitRub: newPpm / 100,
        });
        setFormBusy(false);
        if (!res.ok) {
          setFormError(errorMessage(res.data));
          return;
        }
      }
    }

    setAmountStr("");
    setNote("");
    setAddOpOpen(false);
    onRefresh();
    await refresh();
    if (catModal) {
      const r = await fetchCategories(catIncludeArchived);
      if (r.ok) setModalCategories(r.data.categories);
    }
  }

  async function onDeleteTx(id: string) {
    if (!confirm("Удалить операцию?")) return;
    const res = await deleteTransaction(id);
    if (!res.ok) {
      setLoadError(errorMessage(res.data));
      return;
    }
    onRefresh();
    await refresh();
  }

  async function onAddCategory(ev: FormEvent) {
    ev.preventDefault();
    setCatError(null);
    setCatBusy(true);
    const res = await createCategory(newCatName.trim(), newCatType);
    setCatBusy(false);
    if (!res.ok) {
      setCatError(errorMessage(res.data));
      return;
    }
    setNewCatName("");
    onRefresh();
    await refresh();
    const r = await fetchCategories(catIncludeArchived);
    if (r.ok) setModalCategories(r.data.categories);
  }

  async function toggleArchive(cat: Category) {
    setCatBusy(true);
    const res = await patchCategory(cat.id, { isArchived: !cat.isArchived });
    setCatBusy(false);
    if (!res.ok) {
      setCatError(errorMessage(res.data));
      return;
    }
    onRefresh();
    await refresh();
    const r = await fetchCategories(catIncludeArchived);
    if (r.ok) setModalCategories(r.data.categories);
  }

  async function onAddAccount(ev: FormEvent) {
    ev.preventDefault();
    setAccError(null);
    setAccBusy(true);
    const res = await createAccount(newAccName.trim(), newAccType);
    setAccBusy(false);
    if (!res.ok) {
      setAccError(errorMessage(res.data));
      return;
    }
    setNewAccName("");
    setAccModal(false);
    onRefresh();
    await refresh();
  }

  async function onDeleteAccount(acc: AccountRow) {
    if (!confirm(`Удалить счёт «${acc.name}»?`)) return;
    const res = await deleteAccount(acc.id);
    if (!res.ok) {
      setLoadError(errorMessage(res.data));
      return;
    }
    onRefresh();
    await refresh();
  }

  return (
    <div className="finance-main">
      <div className="finance-main__chips" aria-label="Аналитика (скоро)">
        {ANALYTICS_CHIPS.map((c) => (
          <button
            key={c.label}
            type="button"
            className="finance-main__chip"
            disabled
            title="Скоро"
          >
            <span className="finance-main__chip-ic">{c.icon}</span>
            <span className="finance-main__chip-tx">{c.label}</span>
          </button>
        ))}
      </div>

      <div className="finance-main__toolbar">
        <button
          type="button"
          className="finance__btn-secondary"
          onClick={() => {
            setCatError(null);
            setCatModal(true);
          }}
        >
          Категории
        </button>
        <button
          type="button"
          className="finance__btn-secondary"
          onClick={() => {
            setAccError(null);
            setAccModal(true);
          }}
        >
          Новый счёт
        </button>
      </div>

      {loadError ? <p className="finance__err">{loadError}</p> : null}
      {pending ? <p className="screen__text">Загрузка…</p> : null}

      {!pending && accounts.length > 0 ? (
        <div className="finance-main__accounts-wrap">
          <div className="finance-main__accounts">
            {accounts.map((a) => (
              <div key={a.id} className="finance-main__acc-card">
                <div className="finance-main__acc-type">
                  {ACCOUNT_TYPE_LABEL[a.type]}
                </div>
                <div className="finance-main__acc-name">{a.name}</div>
                <div className="finance-main__acc-bal">
                  {formatRubFromMinor(a.balanceMinor)}
                </div>
                <button
                  type="button"
                  className="finance-main__acc-del"
                  onClick={() => void onDeleteAccount(a)}
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!pending ? (
        <div className="finance-main__totals">
          <div className="finance-main__total-row">
            <span>На счетах</span>
            <strong>{formatRubFromMinor(accountsTotalMinor)}</strong>
          </div>
          <div className="finance-main__total-row">
            <span>Инвестиции</span>
            <strong>{formatRubFromMinor(investmentsTotal)}</strong>
          </div>
          <div className="finance-main__total-row finance-main__total-row--all">
            <span>Всего</span>
            <strong>{formatRubFromMinor(grandTotalMinor)}</strong>
          </div>
        </div>
      ) : null}

      {!pending && summary ? (
        <section className="finance__summary finance-main__month" aria-label="Месяц">
          <label className="finance__month">
            <span className="finance__month-label">Месяц</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          <div className="finance__tiles finance__tiles--compact">
            <div className="finance__tile finance__tile--in">
              <span className="finance__tile-label">Доходы</span>
              <span className="finance__tile-val">
                {formatRubFromMinor(summary.incomeMinor)}
              </span>
            </div>
            <div className="finance__tile finance__tile--out">
              <span className="finance__tile-label">Расходы</span>
              <span className="finance__tile-val">
                {formatRubFromMinor(summary.expenseMinor)}
              </span>
            </div>
            <div className="finance__tile finance__tile--bal">
              <span className="finance__tile-label">Баланс</span>
              <span className="finance__tile-val">
                {formatRubFromMinor(summary.balanceMinor)}
              </span>
            </div>
          </div>
        </section>
      ) : null}

      {!pending ? (
        <div className="finance-main__io-btns">
          <button
            type="button"
            className="finance-main__io finance-main__io--add"
            onClick={() => openAddOp()}
          >
            Добавить
          </button>
        </div>
      ) : null}

      {!pending ? (
        <section className="finance__list finance-main__tx" aria-label="Операции">
          <h2 className="finance__h2">Последние операции</h2>
          {transactions.length === 0 ? (
            <p className="screen__text">Пока пусто.</p>
          ) : (
            <ul className="finance__tx-list">
              {transactions.map((tx) => (
                <li key={tx.id} className="finance__tx">
                  <div className="finance__tx-main">
                    <span className="finance__tx-date">
                      {new Date(tx.occurredAt).toLocaleDateString("ru-RU")}
                    </span>
                    <span className="finance__tx-cat">{tx.category.name}</span>
                    <span
                      className={
                        tx.kind === "INCOME"
                          ? "finance__tx-sum finance__tx-sum--in"
                          : "finance__tx-sum finance__tx-sum--out"
                      }
                    >
                      {tx.kind === "INCOME" ? "+" : "−"}
                      {formatRubFromMinor(tx.amountMinor)}
                    </span>
                  </div>
                  {tx.account ? (
                    <p className="finance__tx-note">
                      {tx.account.name} · {ACCOUNT_TYPE_LABEL[tx.account.type]}
                    </p>
                  ) : null}
                  {tx.note ? (
                    <p className="finance__tx-note">{tx.note}</p>
                  ) : null}
                  <button
                    type="button"
                    className="finance__tx-del"
                    onClick={() => void onDeleteTx(tx.id)}
                  >
                    Удалить
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {addOpOpen
        ? modalPortal(
            <div
              className="finance__modal-back finance__modal-root"
              role="dialog"
              aria-modal="true"
              aria-label="Добавить операцию"
            >
              <div className="finance__modal finance__modal--addop">
                <div className="finance__modal-head">
                  <h2 className="finance__h2">Добавить</h2>
                  <button
                    type="button"
                    className="finance__modal-close"
                    onClick={() => setAddOpOpen(false)}
                  >
                    Закрыть
                  </button>
                </div>
                <form
                  className="finance__form finance-addop"
                  onSubmit={(e) => void onSubmitAddOp(e)}
                >
                  <div
                    className="finance-addop__carousel"
                    role="tablist"
                    aria-label="Тип операции"
                  >
                    {ADD_OP_TABS.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        role="tab"
                        aria-selected={opTab === t.key}
                        className={
                          opTab === t.key
                            ? "finance-addop__chip finance-addop__chip--on"
                            : "finance-addop__chip"
                        }
                        onClick={() => {
                          setFormError(null);
                          setOpTab(t.key);
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {opTab === "debt" ? (
                    <p className="screen__text finance-addop__hint">
                      Учёт долгов появится в следующих версиях.
                    </p>
                  ) : null}

                  {opTab === "expense" ||
                  opTab === "income" ||
                  opTab === "transfer" ? (
                    <label className="finance__field">
                      {opTab === "transfer" ? "Сумма перевода, ₽" : "Сумма, ₽"}
                      <input
                        className="finance__input"
                        type="text"
                        inputMode="decimal"
                        value={amountStr}
                        onChange={(e) => setAmountStr(e.target.value)}
                        required
                      />
                    </label>
                  ) : null}

                  {opTab === "expense" || opTab === "income" ? (
                    <div className="finance-addop__block">
                      <span className="finance-addop__sub">Счёт</span>
                      <div
                        className="finance-addop__carousel"
                        role="listbox"
                        aria-label="Счёт"
                      >
                        {accounts.length === 0 ? (
                          <span className="finance-addop__empty">
                            Нет счетов — создайте в шапке экрана.
                          </span>
                        ) : (
                          accounts.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              role="option"
                              aria-selected={accountId === a.id}
                              className={
                                accountId === a.id
                                  ? "finance-addop__acc finance-addop__acc--on"
                                  : "finance-addop__acc"
                              }
                              onClick={() => setAccountId(a.id)}
                            >
                              <span className="finance-addop__acc-name">
                                {a.name}
                              </span>
                              <span className="finance-addop__acc-meta">
                                {ACCOUNT_TYPE_LABEL[a.type]} ·{" "}
                                {formatRubFromMinor(a.balanceMinor)}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}

                  {opTab === "transfer" ? (
                    <>
                      <div className="finance-addop__block">
                        <span className="finance-addop__sub">Откуда</span>
                        <div
                          className="finance-addop__carousel"
                          role="listbox"
                          aria-label="Счёт списания"
                        >
                          {accounts.length < 2 ? (
                            <span className="finance-addop__empty">
                              Для перевода нужно минимум два счёта.
                            </span>
                          ) : (
                            accounts.map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                role="option"
                                aria-selected={fromAccountId === a.id}
                                className={
                                  fromAccountId === a.id
                                    ? "finance-addop__acc finance-addop__acc--on"
                                    : "finance-addop__acc"
                                }
                                onClick={() => setFromAccountId(a.id)}
                              >
                                <span className="finance-addop__acc-name">
                                  {a.name}
                                </span>
                                <span className="finance-addop__acc-meta">
                                  {ACCOUNT_TYPE_LABEL[a.type]} ·{" "}
                                  {formatRubFromMinor(a.balanceMinor)}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="finance-addop__block">
                        <span className="finance-addop__sub">Куда</span>
                        <div
                          className="finance-addop__carousel"
                          role="listbox"
                          aria-label="Счёт зачисления"
                        >
                          {accounts.length < 2 ? null : (
                            accounts.map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                role="option"
                                aria-selected={toAccountId === a.id}
                                className={
                                  toAccountId === a.id
                                    ? "finance-addop__acc finance-addop__acc--on"
                                    : "finance-addop__acc"
                                }
                                onClick={() => setToAccountId(a.id)}
                              >
                                <span className="finance-addop__acc-name">
                                  {a.name}
                                </span>
                                <span className="finance-addop__acc-meta">
                                  {ACCOUNT_TYPE_LABEL[a.type]} ·{" "}
                                  {formatRubFromMinor(a.balanceMinor)}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  ) : null}

                  {opTab === "expense" || opTab === "income" ? (
                    <div className="finance-addop__block">
                      <span className="finance-addop__sub">Категория</span>
                      {pickable.length === 0 ? (
                        <span className="finance-addop__empty">
                          Нет категорий этого типа — добавьте в «Категории».
                        </span>
                      ) : (
                        <div
                          className="finance-addop__cat-wrap"
                          role="group"
                          aria-label="Категория"
                        >
                          {pickable.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className={
                                categoryId === c.id
                                  ? "finance-addop__cat finance-addop__cat--on"
                                  : "finance-addop__cat"
                              }
                              onClick={() => setCategoryId(c.id)}
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {opTab === "invest" ? (
                    <>
                      <div
                        className="finance-addop__carousel"
                        role="tablist"
                        aria-label="Режим инвестиций"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={invMode === "new"}
                          className={
                            invMode === "new"
                              ? "finance-addop__chip finance-addop__chip--on"
                              : "finance-addop__chip"
                          }
                          onClick={() => {
                            setFormError(null);
                            setInvMode("new");
                          }}
                        >
                          Новая позиция
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={invMode === "add"}
                          className={
                            invMode === "add"
                              ? "finance-addop__chip finance-addop__chip--on"
                              : "finance-addop__chip"
                          }
                          onClick={() => {
                            setFormError(null);
                            setInvMode("add");
                          }}
                        >
                          Докупка
                        </button>
                      </div>
                      {invMode === "new" ? (
                        <>
                          <InvestQuotePicker
                            disabled={formBusy}
                            onApply={(p) => {
                              setInvName(p.displayName);
                              setInvAssetKind(p.assetKind);
                              setInvPriceStr(String(p.priceRub));
                            }}
                          />
                          <label className="finance__field">
                            Название
                            <input
                              className="finance__input"
                              value={invName}
                              onChange={(e) => setInvName(e.target.value)}
                              maxLength={120}
                            />
                          </label>
                          <label className="finance__field">
                            Тип
                            <select
                              className="finance__input"
                              value={invAssetKind}
                              onChange={(e) =>
                                setInvAssetKind(
                                  e.target.value as InvestmentAssetKind,
                                )
                              }
                            >
                              {(
                                Object.keys(ASSET_LABEL) as InvestmentAssetKind[]
                              ).map((k) => (
                                <option key={k} value={k}>
                                  {ASSET_LABEL[k]}
                                </option>
                              ))}
                            </select>
                          </label>
                        </>
                      ) : (
                        <div className="finance-addop__block">
                          <span className="finance-addop__sub">Позиция</span>
                          <div
                            className="finance-addop__carousel"
                            role="listbox"
                          >
                            {invHoldings.length === 0 ? (
                              <span className="finance-addop__empty">
                                Пока нет позиций — выберите «Новая позиция».
                              </span>
                            ) : (
                              invHoldings.map((h) => (
                                <button
                                  key={h.id}
                                  type="button"
                                  role="option"
                                  aria-selected={invHoldingId === h.id}
                                  className={
                                    invHoldingId === h.id
                                      ? "finance-addop__acc finance-addop__acc--on"
                                      : "finance-addop__acc"
                                  }
                                  onClick={() => setInvHoldingId(h.id)}
                                >
                                  <span className="finance-addop__acc-name">
                                    {h.name}
                                  </span>
                                  <span className="finance-addop__acc-meta">
                                    {ASSET_LABEL[h.assetKind]} ·{" "}
                                    {h.units} шт
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                      <label className="finance__field">
                        Количество (шт.)
                        <input
                          className="finance__input"
                          type="text"
                          inputMode="decimal"
                          value={invUnitsStr}
                          onChange={(e) => setInvUnitsStr(e.target.value)}
                        />
                      </label>
                      <label className="finance__field">
                        Цена за единицу, ₽
                        <input
                          className="finance__input"
                          type="text"
                          inputMode="decimal"
                          value={invPriceStr}
                          onChange={(e) => setInvPriceStr(e.target.value)}
                        />
                      </label>
                    </>
                  ) : null}

                  {opTab !== "invest" && opTab !== "debt" ? (
                    <>
                      <label className="finance__field">
                        Дата
                        <input
                          className="finance__input"
                          type="date"
                          value={occurredDate}
                          onChange={(e) => setOccurredDate(e.target.value)}
                          required
                        />
                      </label>
                      <label className="finance__field">
                        Комментарий
                        <input
                          className="finance__input"
                          type="text"
                          maxLength={500}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                        />
                      </label>
                    </>
                  ) : null}

                  {formError ? (
                    <p className="finance__err">{formError}</p>
                  ) : null}
                  <button
                    className="finance__submit"
                    type="submit"
                    disabled={
                      formBusy ||
                      opTab === "debt" ||
                      (opTab === "transfer" && accounts.length < 2) ||
                      ((opTab === "expense" || opTab === "income") &&
                        (accounts.length === 0 || pickable.length === 0))
                    }
                  >
                    {formBusy ? "…" : "Добавить"}
                  </button>
                </form>
              </div>
            </div>,
          )
        : null}

      {accModal
        ? modalPortal(
            <div
              className="finance__modal-back finance__modal-root"
              role="dialog"
              aria-modal="true"
            >
          <div className="finance__modal">
            <div className="finance__modal-head">
              <h2 className="finance__h2">Новый счёт</h2>
              <button
                type="button"
                className="finance__modal-close"
                onClick={() => setAccModal(false)}
              >
                Закрыть
              </button>
            </div>
            {accError ? <p className="finance__err">{accError}</p> : null}
            <form className="finance__form" onSubmit={(e) => void onAddAccount(e)}>
              <input
                className="finance__input"
                placeholder="Название"
                value={newAccName}
                onChange={(e) => setNewAccName(e.target.value)}
                maxLength={80}
                required
              />
              <select
                className="finance__input"
                value={newAccType}
                onChange={(e) =>
                  setNewAccType(e.target.value as AccountType)
                }
              >
                <option value="CARD">Карта</option>
                <option value="CASH">Наличные</option>
                <option value="BANK">Счёт</option>
                <option value="OTHER">Другое</option>
              </select>
              <button className="finance__submit" type="submit" disabled={accBusy}>
                Создать
              </button>
            </form>
          </div>
        </div>,
          )
        : null}

      {catModal
        ? modalPortal(
            <div
              className="finance__modal-back finance__modal-root"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cat-modal-title"
            >
          <div className="finance__modal">
            <div className="finance__modal-head">
              <h2 id="cat-modal-title" className="finance__h2">
                Категории
              </h2>
              <button
                type="button"
                className="finance__modal-close"
                onClick={() => setCatModal(false)}
              >
                Закрыть
              </button>
            </div>
            <label className="finance__check">
              <input
                type="checkbox"
                checked={catIncludeArchived}
                onChange={(e) => setCatIncludeArchived(e.target.checked)}
              />
              Показывать архивные
            </label>
            {catError ? <p className="finance__err">{catError}</p> : null}
            <ul className="finance__cat-list">
              {modalCategories.map((c) => (
                <li key={c.id} className="finance__cat-row">
                  <span className="finance__cat-name">
                    {c.name}
                    {c.isBuiltIn ? (
                      <span className="finance__cat-badge">встроенная</span>
                    ) : (
                      <span className="finance__cat-badge finance__cat-badge--own">
                        своя
                      </span>
                    )}
                    {c.isArchived ? (
                      <span className="finance__cat-badge finance__cat-badge--arc">
                        архив
                      </span>
                    ) : null}
                  </span>
                  <span className="finance__cat-type">{TYPE_LABEL[c.type]}</span>
                  <button
                    type="button"
                    className="finance__cat-act"
                    disabled={catBusy}
                    onClick={() => void toggleArchive(c)}
                  >
                    {c.isArchived ? "Вернуть" : "В архив"}
                  </button>
                </li>
              ))}
            </ul>
            <form className="finance__newcat" onSubmit={(e) => void onAddCategory(e)}>
              <h3 className="finance__h3">Новая категория</h3>
              <input
                className="finance__input"
                placeholder="Название"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                maxLength={80}
                required
              />
              <select
                className="finance__input"
                value={newCatType}
                onChange={(e) =>
                  setNewCatType(e.target.value as typeof newCatType)
                }
              >
                <option value="EXPENSE">Расход</option>
                <option value="INCOME">Доход</option>
                <option value="BOTH">Оба типа</option>
              </select>
              <button className="finance__submit" type="submit" disabled={catBusy}>
                Добавить
              </button>
            </form>
          </div>
        </div>,
          )
        : null}
    </div>
  );
}

function FinanceInvestPanel({ bump }: { bump: number }) {
  const [data, setData] = useState<{
    totalValueMinor: number;
    holdings: InvestmentHoldingRow[];
    metrics: {
      incomePer1000YearMinor: number | null;
      couponDividendDayMinor: number | null;
      couponDividendMonthMinor: number | null;
      couponDividendYearMinor: number | null;
      note: string;
    };
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [assetKind, setAssetKind] = useState<InvestmentAssetKind>("STOCK");
  const [unitsStr, setUnitsStr] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [annualIncomeStr, setAnnualIncomeStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [incomeModal, setIncomeModal] = useState<InvestmentHoldingRow | null>(
    null,
  );
  const [incomeModalStr, setIncomeModalStr] = useState("");
  const [incomeBusy, setIncomeBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    const r = await fetchInvestOverview();
    if (!r.ok) {
      setErr(errorMessage(r.data));
      return;
    }
    setData({
      totalValueMinor: r.data.totalValueMinor,
      holdings: r.data.holdings,
      metrics: r.data.metrics,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load, bump]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const units = Number(String(unitsStr).replace(",", "."));
    const price = Number(String(priceStr).replace(",", "."));
    if (!Number.isFinite(units) || units <= 0) return;
    if (!Number.isFinite(price) || price <= 0) return;
    let annualRub: number | null | undefined;
    if (annualIncomeStr.trim()) {
      const a = Number(String(annualIncomeStr).replace(",", "."));
      if (!Number.isFinite(a) || a < 0) {
        setErr("Годовой купон+дивиденд — неотрицательное число");
        return;
      }
      annualRub = a;
    }
    setBusy(true);
    const res = await createHolding({
      name: name.trim(),
      assetKind,
      units,
      pricePerUnitRub: price,
      ...(annualRub !== undefined
        ? { annualCouponDividendRub: annualRub }
        : {}),
    });
    setBusy(false);
    if (!res.ok) {
      setErr(errorMessage(res.data));
      return;
    }
    setName("");
    setUnitsStr("");
    setPriceStr("");
    setAnnualIncomeStr("");
    setModal(false);
    void load();
  }

  async function onSaveIncome(e: FormEvent) {
    e.preventDefault();
    if (!incomeModal) return;
    const raw = incomeModalStr.trim();
    const payload =
      raw === ""
        ? { annualCouponDividendRub: null as const }
        : (() => {
            const a = Number(raw.replace(",", "."));
            if (!Number.isFinite(a) || a < 0) {
              setErr("Годовой купон+дивиденд — неотрицательное число");
              return null;
            }
            return { annualCouponDividendRub: a };
          })();
    if (!payload) return;
    setIncomeBusy(true);
    setErr(null);
    const r = await patchHolding(incomeModal.id, payload);
    setIncomeBusy(false);
    if (!r.ok) {
      setErr(errorMessage(r.data));
      return;
    }
    setIncomeModal(null);
    void load();
  }

  async function onDel(id: string) {
    if (!confirm("Удалить позицию?")) return;
    const r = await deleteHolding(id);
    if (!r.ok) {
      setErr(errorMessage(r.data));
      return;
    }
    void load();
  }

  return (
    <div className="finance-inv">
      <h2 className="finance__h2">Портфель</h2>
      {err ? <p className="finance__err">{err}</p> : null}
      {!data ? (
        <p className="screen__text">Загрузка…</p>
      ) : (
        <>
          <div className="finance-inv__hero">
            <span className="finance-inv__hero-label">Оценка</span>
            <span className="finance-inv__hero-val">
              {formatRubFromMinor(data.totalValueMinor)}
            </span>
            <ul className="finance-inv__metrics" aria-label="Доходность по купонам и дивидендам">
              <li className="finance-inv__metric">
                <span className="finance-inv__metric-label">
                  На вложенные 1000 ₽ (в год, оценка)
                </span>
                <span className="finance-inv__metric-val">
                  {data.metrics.incomePer1000YearMinor != null
                    ? formatRubFromMinor(data.metrics.incomePer1000YearMinor)
                    : "—"}
                </span>
              </li>
              <li className="finance-inv__metric">
                <span className="finance-inv__metric-label">
                  Доход в день (купоны и дивиденды)
                </span>
                <span className="finance-inv__metric-val">
                  {data.metrics.couponDividendDayMinor != null
                    ? formatRubFromMinor(data.metrics.couponDividendDayMinor)
                    : "—"}
                </span>
              </li>
              <li className="finance-inv__metric">
                <span className="finance-inv__metric-label">
                  Доход в месяц (купоны и дивиденды)
                </span>
                <span className="finance-inv__metric-val">
                  {data.metrics.couponDividendMonthMinor != null
                    ? formatRubFromMinor(data.metrics.couponDividendMonthMinor)
                    : "—"}
                </span>
              </li>
              <li className="finance-inv__metric">
                <span className="finance-inv__metric-label">
                  Доход в год (купоны и дивиденды)
                </span>
                <span className="finance-inv__metric-val">
                  {data.metrics.couponDividendYearMinor != null
                    ? formatRubFromMinor(data.metrics.couponDividendYearMinor)
                    : "—"}
                </span>
              </li>
            </ul>
          </div>
          <p className="finance-inv__hint">{data.metrics.note}</p>
          <button
            type="button"
            className="finance__submit finance-inv__add"
            onClick={() => {
              setErr(null);
              setModal(true);
            }}
          >
            Добавить позицию
          </button>
          <ul className="finance-inv__list">
            {data.holdings.length === 0 ? (
              <li className="screen__text">Позиций пока нет.</li>
            ) : (
              data.holdings.map((h) => (
                <li key={h.id} className="finance-inv__row">
                  <div>
                    <strong>{h.name}</strong>
                    <span className="finance-inv__meta">
                      {ASSET_LABEL[h.assetKind]} · {h.units} ×{" "}
                      {formatRubFromMinor(h.pricePerUnitMinor)}
                    </span>
                    {h.annualCouponDividendMinor != null &&
                    h.annualCouponDividendMinor > 0 ? (
                      <span className="finance-inv__meta finance-inv__meta--inc">
                        Купон/див:{" "}
                        {formatRubFromMinor(h.annualCouponDividendMinor)}/год
                      </span>
                    ) : null}
                  </div>
                  <div className="finance-inv__row-r">
                    <span>{formatRubFromMinor(h.valueMinor)}</span>
                    <button
                      type="button"
                      className="finance-inv__income-btn"
                      onClick={() => {
                        setErr(null);
                        setIncomeModal(h);
                        setIncomeModalStr(
                          h.annualCouponDividendMinor != null &&
                            h.annualCouponDividendMinor > 0
                            ? String(h.annualCouponDividendMinor / 100)
                            : "",
                        );
                      }}
                    >
                      Доход
                    </button>
                    <button
                      type="button"
                      className="finance__tx-del"
                      onClick={() => void onDel(h.id)}
                    >
                      Удалить
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </>
      )}

      {modal
        ? modalPortal(
            <div
              className="finance__modal-back finance__modal-root"
              role="dialog"
              aria-modal="true"
            >
          <div className="finance__modal">
            <div className="finance__modal-head">
              <h2 className="finance__h2">Новая позиция</h2>
              <button
                type="button"
                className="finance__modal-close"
                onClick={() => setModal(false)}
              >
                Закрыть
              </button>
            </div>
            <form className="finance__form" onSubmit={(e) => void onAdd(e)}>
              <InvestQuotePicker
                disabled={busy}
                onApply={(p) => {
                  setName(p.displayName);
                  setAssetKind(p.assetKind);
                  setPriceStr(String(p.priceRub));
                }}
              />
              <input
                className="finance__input"
                placeholder="Название / тикер"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                required
              />
              <select
                className="finance__input"
                value={assetKind}
                onChange={(e) =>
                  setAssetKind(e.target.value as InvestmentAssetKind)
                }
              >
                <option value="STOCK">Акция</option>
                <option value="BOND">Облигация</option>
                <option value="FUND">Фонд</option>
                <option value="CRYPTO">Крипто</option>
                <option value="OTHER">Другое</option>
              </select>
              <label className="finance__field">
                Количество (шт.)
                <input
                  className="finance__input"
                  inputMode="decimal"
                  value={unitsStr}
                  onChange={(e) => setUnitsStr(e.target.value)}
                  required
                />
              </label>
              <label className="finance__field">
                Цена за единицу, ₽
                <input
                  className="finance__input"
                  inputMode="decimal"
                  value={priceStr}
                  onChange={(e) => setPriceStr(e.target.value)}
                  required
                />
              </label>
              <label className="finance__field">
                Ожидаемый купон + дивиденды в год, ₽
                <input
                  className="finance__input"
                  inputMode="decimal"
                  placeholder="необязательно"
                  value={annualIncomeStr}
                  onChange={(e) => setAnnualIncomeStr(e.target.value)}
                />
              </label>
              <button className="finance__submit" type="submit" disabled={busy}>
                Добавить
              </button>
            </form>
          </div>
        </div>,
          )
        : null}

      {incomeModal
        ? modalPortal(
            <div
              className="finance__modal-back finance__modal-root"
              role="dialog"
              aria-modal="true"
              aria-label="Купон и дивиденды"
            >
              <div className="finance__modal">
                <div className="finance__modal-head">
                  <h2 className="finance__h2">Купон и дивиденды</h2>
                  <button
                    type="button"
                    className="finance__modal-close"
                    onClick={() => setIncomeModal(null)}
                  >
                    Закрыть
                  </button>
                </div>
                <p className="finance-inv__edit-name">{incomeModal.name}</p>
                <form
                  className="finance__form"
                  onSubmit={(e) => void onSaveIncome(e)}
                >
                  <label className="finance__field">
                    Ожидаемый доход в год (купоны + дивиденды), ₽
                    <input
                      className="finance__input"
                      inputMode="decimal"
                      placeholder="Пусто — не учитывать"
                      value={incomeModalStr}
                      onChange={(e) => setIncomeModalStr(e.target.value)}
                    />
                  </label>
                  {err ? <p className="finance__err">{err}</p> : null}
                  <button
                    className="finance__submit"
                    type="submit"
                    disabled={incomeBusy}
                  >
                    {incomeBusy ? "…" : "Сохранить"}
                  </button>
                </form>
              </div>
            </div>,
          )
        : null}
    </div>
  );
}

function FinanceAnalyticsPanel({ bump }: { bump: number }) {
  const [month, setMonth] = useState(currentMonthYm);
  const [expenses, setExpenses] = useState<
    { categoryName: string; amountMinor: number }[]
  >([]);
  const [incomes, setIncomes] = useState<
    { categoryName: string; amountMinor: number }[]
  >([]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    void (async () => {
      setPending(true);
      setErr(null);
      const r = await fetchSummaryByCategory(month);
      setPending(false);
      if (!r.ok) {
        setErr(errorMessage(r.data));
        return;
      }
      setExpenses(
        [...r.data.expenses].sort((a, b) => b.amountMinor - a.amountMinor),
      );
      setIncomes(
        [...r.data.incomes].sort((a, b) => b.amountMinor - a.amountMinor),
      );
    })();
  }, [month, bump]);

  const expMax = Math.max(1, ...expenses.map((e) => e.amountMinor));

  return (
    <div className="finance-an">
      <h2 className="finance__h2">Аналитика</h2>
      <label className="finance__month">
        <span className="finance__month-label">Месяц</span>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </label>
      {err ? <p className="finance__err">{err}</p> : null}
      {pending ? <p className="screen__text">Загрузка…</p> : null}
      {!pending ? (
        <>
          <h3 className="finance__h3">Расходы по категориям</h3>
          <ul className="finance-an__bars">
            {expenses.length === 0 ? (
              <li className="screen__text">Нет данных.</li>
            ) : (
              expenses.map((e) => (
                <li key={e.categoryName + e.amountMinor} className="finance-an__bar">
                  <div className="finance-an__bar-h">
                    <span>{e.categoryName}</span>
                    <span>{formatRubFromMinor(e.amountMinor)}</span>
                  </div>
                  <div className="finance-an__bar-track">
                    <div
                      className="finance-an__bar-fill"
                      style={{
                        width: `${(100 * e.amountMinor) / expMax}%`,
                      }}
                    />
                  </div>
                </li>
              ))
            )}
          </ul>
          <h3 className="finance__h3">Доходы по категориям</h3>
          <ul className="finance-an__list">
            {incomes.length === 0 ? (
              <li className="screen__text">Нет данных.</li>
            ) : (
              incomes.map((i) => (
                <li key={i.categoryName} className="finance-an__li">
                  <span>{i.categoryName}</span>
                  <span className="finance-an__li-sum">
                    {formatRubFromMinor(i.amountMinor)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </>
      ) : null}
    </div>
  );
}
