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
  deleteHolding,
  deleteTransaction,
  errorMessage,
  fetchAccounts,
  fetchCategories,
  fetchFinanceSettings,
  fetchInvestOverview,
  fetchReportingForecast,
  fetchReportingSummary,
  fetchSummaryByCategory,
  fetchTransactions,
  mergeAccountInto,
  patchFinanceSettings,
  patchCategory,
  patchHolding,
  type AccountRow,
  type AccountType,
  type Category,
  type DepositSavingsAccountRow,
  type InvestmentAssetKind,
  type InvestmentHoldingRow,
  type InvestAllocation,
  type ReportingForecast,
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
  DEPOSIT: "Вклад",
  SAVINGS: "Накопительный счёт",
  OTHER: "Другое",
};

function isDepositOrSavings(t: AccountType): boolean {
  return t === "DEPOSIT" || t === "SAVINGS";
}

function formatRuDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function DepositSavingsCarousel({
  accounts,
  title,
  onRequestDelete,
}: {
  accounts: (DepositSavingsAccountRow | AccountRow)[];
  title: string;
  onRequestDelete?: (accountId: string) => void;
}) {
  const list = accounts.filter(
    (a) => a.type === "DEPOSIT" || a.type === "SAVINGS",
  );
  if (list.length === 0) return null;
  return (
    <div className="finance-dep-carousel-wrap">
      <h3 className="finance__h3 finance-dep-carousel__title">{title}</h3>
      <div className="finance-dep-carousel" role="list">
        {list.map((a) => (
          <div key={a.id} className="finance-dep-carousel__card" role="listitem">
            <div className="finance-dep-carousel__type">
              {ACCOUNT_TYPE_LABEL[a.type]}
            </div>
            <div className="finance-dep-carousel__name">{a.name}</div>
            <div className="finance-dep-carousel__bal">
              {formatRubFromMinor(a.balanceMinor)}
            </div>
            {a.annualInterestPercent != null && a.annualInterestPercent > 0 ? (
              <div className="finance-dep-carousel__rate">
                {a.annualInterestPercent.toLocaleString("ru-RU", {
                  maximumFractionDigits: 2,
                })}
                % годовых
              </div>
            ) : (
              <div className="finance-dep-carousel__rate finance-dep-carousel__rate--muted">
                Ставка не задана
              </div>
            )}
            <div className="finance-dep-carousel__inc">
              ~{" "}
              {formatRubFromMinor(a.interestIncomeMonthMinor)}
              /мес
            </div>
            {onRequestDelete ? (
              <button
                type="button"
                className="finance-main__acc-del finance-dep-carousel__del"
                onClick={() => onRequestDelete(a.id)}
              >
                Удалить
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

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
            <FinanceInvestPanel
              bump={bump}
              investActive={tab === 1}
              onPortfolioChange={refreshAll}
            />
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
  const [reporting, setReporting] = useState<{
    financeReportingDay: number;
    periodStart: string;
    periodLastDay: string;
    incomeMinor: number;
    expenseMinor: number;
    balanceMinor: number;
  } | null>(null);
  const [capAlloc, setCapAlloc] = useState<InvestAllocation | null>(null);
  const [monthlyPassiveMinor, setMonthlyPassiveMinor] = useState(0);
  const [reportingDayDraft, setReportingDayDraft] = useState("1");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [delModalAcc, setDelModalAcc] = useState<AccountRow | null>(null);
  const [delTargetId, setDelTargetId] = useState("");
  const [delBusy, setDelBusy] = useState(false);
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
  const [invQuoteMeta, setInvQuoteMeta] = useState<{
    quoteSource: "coingecko" | "moex";
    quoteExternalId: string;
    quoteMoexMarket: "shares" | "bonds" | null;
    annualIncomePerUnitRub?: number | null;
  } | null>(null);

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
  const [newAccInterestStr, setNewAccInterestStr] = useState("");
  const [accBusy, setAccBusy] = useState(false);
  const [accError, setAccError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    setPending(true);
    const [rep, c, t, a, ov, st] = await Promise.all([
      fetchReportingSummary(),
      fetchCategories(false),
      fetchTransactions(),
      fetchAccounts(),
      fetchInvestOverview(false),
      fetchFinanceSettings(),
    ]);
    setPending(false);
    if (!rep.ok) {
      setLoadError(errorMessage(rep.data));
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
    if (!st.ok) {
      setLoadError(errorMessage(st.data));
      return;
    }
    setReporting({
      financeReportingDay: rep.data.financeReportingDay,
      periodStart: rep.data.periodStart,
      periodLastDay: rep.data.periodLastDay,
      incomeMinor: rep.data.incomeMinor,
      expenseMinor: rep.data.expenseMinor,
      balanceMinor: rep.data.balanceMinor,
    });
    setReportingDayDraft(String(st.data.financeReportingDay));
    setCategories(c.data.categories);
    setTransactions(t.data.transactions);
    setAccounts(a.data.accounts);
    setInvestmentsTotal(a.data.investmentsTotalMinor);
    if (ov.ok) {
      setCapAlloc(ov.data.allocation);
      const dep = ov.data.metrics.depositSavingsIncomeMonthMinor;
      const sec = ov.data.metrics.couponDividendMonthMinor ?? 0;
      setMonthlyPassiveMinor(dep + sec);
    } else {
      setCapAlloc(null);
      setMonthlyPassiveMinor(0);
    }
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
  }, []);

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
    setInvQuoteMeta(null);
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
          ...(invQuoteMeta
            ? {
                quoteSource: invQuoteMeta.quoteSource,
                quoteExternalId: invQuoteMeta.quoteExternalId,
                quoteMoexMarket: invQuoteMeta.quoteMoexMarket,
              }
            : {}),
          ...(invQuoteMeta?.annualIncomePerUnitRub != null &&
          invQuoteMeta.annualIncomePerUnitRub > 0
            ? { annualIncomePerUnitRub: invQuoteMeta.annualIncomePerUnitRub }
            : {}),
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
    let annualInterestPercent: number | null | undefined;
    if (isDepositOrSavings(newAccType)) {
      const raw = newAccInterestStr.trim();
      if (raw === "") {
        annualInterestPercent = null;
      } else {
        const p = Number(raw.replace(",", "."));
        if (!Number.isFinite(p) || p < 0 || p > 1000) {
          setAccError("Ставка % — число от 0 до 1000 или пусто");
          return;
        }
        annualInterestPercent = p;
      }
    }
    setAccBusy(true);
    const res = await createAccount({
      name: newAccName.trim(),
      type: newAccType,
      ...(isDepositOrSavings(newAccType)
        ? { annualInterestPercent: annualInterestPercent ?? null }
        : {}),
    });
    setAccBusy(false);
    if (!res.ok) {
      setAccError(errorMessage(res.data));
      return;
    }
    setNewAccName("");
    setNewAccInterestStr("");
    setAccModal(false);
    onRefresh();
    await refresh();
  }

  function openDelModal(acc: AccountRow) {
    setLoadError(null);
    setDelModalAcc(acc);
    const others = accounts.filter((x) => x.id !== acc.id);
    setDelTargetId(others[0]?.id ?? "");
  }

  async function confirmMergeDelete() {
    if (!delModalAcc || !delTargetId || delModalAcc.id === delTargetId) return;
    setDelBusy(true);
    setLoadError(null);
    const res = await mergeAccountInto(delModalAcc.id, delTargetId);
    setDelBusy(false);
    if (!res.ok) {
      setLoadError(errorMessage(res.data));
      return;
    }
    setDelModalAcc(null);
    onRefresh();
    await refresh();
  }

  async function onSaveReportingDay(e: FormEvent) {
    e.preventDefault();
    const n = Number(String(reportingDayDraft).replace(",", "."));
    if (!Number.isFinite(n) || n < 1 || n > 28) {
      setLoadError("Отчётное число — целое от 1 до 28");
      return;
    }
    setSettingsBusy(true);
    setLoadError(null);
    const r = await patchFinanceSettings({
      financeReportingDay: Math.floor(n),
    });
    setSettingsBusy(false);
    if (!r.ok) {
      setLoadError(errorMessage(r.data));
      return;
    }
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
            setNewAccInterestStr("");
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
          <DepositSavingsCarousel
            accounts={accounts}
            title="Вклады и накопительные"
            onRequestDelete={(id) => {
              const acc = accounts.find((x) => x.id === id);
              if (acc) openDelModal(acc);
            }}
          />
          {accounts.some((a) => !isDepositOrSavings(a.type)) ? (
            <>
              <h3 className="finance__h3 finance-main__acc-other-title">
                Остальные счета
              </h3>
              <div className="finance-main__accounts">
                {accounts
                  .filter((a) => !isDepositOrSavings(a.type))
                  .map((a) => (
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
                        onClick={() => openDelModal(a)}
                      >
                        Удалить
                      </button>
                    </div>
                  ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {!pending ? (
        <div className="finance-main__totals">
          <div className="finance-main__total-row">
            <span>На счетах</span>
            <strong>{formatRubFromMinor(accountsTotalMinor)}</strong>
          </div>
          <div className="finance-main__total-row">
            <span>Инвестиции (оценка)</span>
            <strong>{formatRubFromMinor(investmentsTotal)}</strong>
          </div>
          <div className="finance-main__total-row finance-main__total-row--all">
            <span>Всего</span>
            <strong>{formatRubFromMinor(grandTotalMinor)}</strong>
          </div>
          {monthlyPassiveMinor > 0 ? (
            <div className="finance-main__total-row finance-main__total-row--passive">
              <span>Оценка пассивного дохода (~в месяц)</span>
              <strong>{formatRubFromMinor(monthlyPassiveMinor)}</strong>
            </div>
          ) : null}
          {capAlloc ? (
            <div className="finance-main__cap-split">
              <h3 className="finance__h3 finance-main__cap-split-title">
                Разбивка капитала
              </h3>
              <ul className="finance-main__cap-split-list">
                <li>
                  <span>Вклады</span>
                  <span>{formatRubFromMinor(capAlloc.depositsMinor)}</span>
                </li>
                <li>
                  <span>Накопительные счета</span>
                  <span>{formatRubFromMinor(capAlloc.savingsMinor)}</span>
                </li>
                <li>
                  <span>Акции</span>
                  <span>{formatRubFromMinor(capAlloc.stocksMinor)}</span>
                </li>
                <li>
                  <span>Облигации</span>
                  <span>{formatRubFromMinor(capAlloc.bondsMinor)}</span>
                </li>
                <li>
                  <span>Прочие инструменты</span>
                  <span>
                    {formatRubFromMinor(capAlloc.otherInstrumentsMinor)}
                  </span>
                </li>
                <li className="finance-main__cap-split-muted">
                  <span>Карты, наличные, счета вне структуры</span>
                  <span>
                    {formatRubFromMinor(
                      Math.max(
                        0,
                        capAlloc.totalWealthMinor - capAlloc.portfolioSplitMinor,
                      ),
                    )}
                  </span>
                </li>
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {!pending && reporting ? (
        <section
          className="finance__summary finance-main__month"
          aria-label="Отчётный период"
        >
          <p className="finance-main__period-label">
            Текущий отчётный период:{" "}
            <strong>
              {formatRuDateShort(reporting.periodStart)} —{" "}
              {formatRuDateShort(`${reporting.periodLastDay}T12:00:00.000Z`)}
            </strong>
          </p>
          <form
            className="finance-main__reporting-day-form"
            onSubmit={(e) => void onSaveReportingDay(e)}
          >
            <label className="finance__field finance-main__reporting-day-field">
              Отчётное число месяца (1–28)
              <input
                className="finance__input"
                type="number"
                min={1}
                max={28}
                value={reportingDayDraft}
                onChange={(e) => setReportingDayDraft(e.target.value)}
              />
            </label>
            <button
              type="submit"
              className="finance__btn-secondary"
              disabled={settingsBusy}
            >
              {settingsBusy ? "…" : "Сохранить"}
            </button>
          </form>
          <div className="finance__tiles finance__tiles--compact">
            <div className="finance__tile finance__tile--in">
              <span className="finance__tile-label">Доходы (период)</span>
              <span className="finance__tile-val">
                {formatRubFromMinor(reporting.incomeMinor)}
              </span>
            </div>
            <div className="finance__tile finance__tile--out">
              <span className="finance__tile-label">Расходы (период)</span>
              <span className="finance__tile-val">
                {formatRubFromMinor(reporting.expenseMinor)}
              </span>
            </div>
            <div className="finance__tile finance__tile--bal">
              <span className="finance__tile-label">Баланс (период)</span>
              <span className="finance__tile-val">
                {formatRubFromMinor(reporting.balanceMinor)}
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
                              if (p.quoteSource && p.quoteExternalId) {
                                setInvQuoteMeta({
                                  quoteSource: p.quoteSource,
                                  quoteExternalId: p.quoteExternalId,
                                  quoteMoexMarket: p.quoteMoexMarket ?? null,
                                  annualIncomePerUnitRub:
                                    p.annualIncomePerUnitRub,
                                });
                              } else {
                                setInvQuoteMeta(null);
                              }
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

      {delModalAcc
        ? modalPortal(
            <div
              className="finance__modal-back finance__modal-root"
              role="dialog"
              aria-modal="true"
              aria-labelledby="del-acc-title"
            >
              <div className="finance__modal">
                <div className="finance__modal-head">
                  <h2 id="del-acc-title" className="finance__h2">
                    Удалить счёт
                  </h2>
                  <button
                    type="button"
                    className="finance__modal-close"
                    onClick={() => setDelModalAcc(null)}
                  >
                    Закрыть
                  </button>
                </div>
                <p className="finance-main__del-warn">
                  Счёт «{delModalAcc.name}» будет удалён. Все операции и
                  переводы с этим счётом будут перенесены на выбранный счёт.
                  Действие необратимо.
                </p>
                <label className="finance__field">
                  Перенести на счёт
                  <select
                    className="finance__input"
                    value={delTargetId}
                    onChange={(e) => setDelTargetId(e.target.value)}
                  >
                    {accounts
                      .filter((x) => x.id !== delModalAcc.id)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name} ({ACCOUNT_TYPE_LABEL[x.type]})
                        </option>
                      ))}
                  </select>
                </label>
                {loadError ? <p className="finance__err">{loadError}</p> : null}
                <button
                  type="button"
                  className="finance__submit"
                  disabled={
                    delBusy ||
                    !delTargetId ||
                    accounts.filter((x) => x.id !== delModalAcc.id).length === 0
                  }
                  onClick={() => void confirmMergeDelete()}
                >
                  {delBusy ? "…" : "Удалить"}
                </button>
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
                onChange={(e) => {
                  setNewAccType(e.target.value as AccountType);
                  setNewAccInterestStr("");
                }}
              >
                <option value="CARD">Карта</option>
                <option value="CASH">Наличные</option>
                <option value="BANK">Счёт</option>
                <option value="DEPOSIT">Вклад</option>
                <option value="SAVINGS">Накопительный счёт</option>
                <option value="OTHER">Другое</option>
              </select>
              {isDepositOrSavings(newAccType) ? (
                <label className="finance__field">
                  Ставка, % годовых
                  <input
                    className="finance__input"
                    inputMode="decimal"
                    placeholder="например 16 (необязательно)"
                    value={newAccInterestStr}
                    onChange={(e) => setNewAccInterestStr(e.target.value)}
                  />
                </label>
              ) : null}
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

function FinanceInvestPanel({
  bump,
  investActive,
  onPortfolioChange,
}: {
  bump: number;
  investActive: boolean;
  onPortfolioChange: () => void;
}) {
  const [data, setData] = useState<{
    totalValueMinor: number;
    holdings: InvestmentHoldingRow[];
    depositSavingsAccounts: DepositSavingsAccountRow[];
    allocation: InvestAllocation;
    metrics: {
      incomePer1000YearMinor: number | null;
      couponDividendDayMinor: number | null;
      couponDividendMonthMinor: number | null;
      couponDividendYearMinor: number | null;
      depositSavingsIncomeMonthMinor: number;
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
  const [incomePeriodYear, setIncomePeriodYear] = useState(true);
  const [invQuoteMeta, setInvQuoteMeta] = useState<{
    quoteSource: "coingecko" | "moex";
    quoteExternalId: string;
    quoteMoexMarket: "shares" | "bonds" | null;
    annualIncomePerUnitRub?: number | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [incomeModal, setIncomeModal] = useState<InvestmentHoldingRow | null>(
    null,
  );
  const [incomeModalStr, setIncomeModalStr] = useState("");
  const [incomeModalIsYear, setIncomeModalIsYear] = useState(true);
  const [incomeBusy, setIncomeBusy] = useState(false);
  const investEnteredRef = useRef(false);

  const load = useCallback(async (refreshQuotes?: boolean) => {
    setErr(null);
    const r = await fetchInvestOverview(refreshQuotes === true);
    if (!r.ok) {
      setErr(errorMessage(r.data));
      return;
    }
    setData({
      totalValueMinor: r.data.totalValueMinor,
      holdings: r.data.holdings,
      depositSavingsAccounts: r.data.depositSavingsAccounts,
      allocation: r.data.allocation,
      metrics: r.data.metrics,
    });
  }, []);

  useEffect(() => {
    if (!investActive) {
      investEnteredRef.current = false;
      return;
    }
    const refreshQuotes = !investEnteredRef.current;
    investEnteredRef.current = true;
    void load(refreshQuotes);
  }, [investActive, bump, load]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const units = Number(String(unitsStr).replace(",", "."));
    const price = Number(String(priceStr).replace(",", "."));
    if (!Number.isFinite(units) || units <= 0) return;
    if (!Number.isFinite(price) || price <= 0) return;
    let annualIncomePerUnitRub: number | undefined;
    let monthlyIncomePerUnitRub: number | undefined;
    if (annualIncomeStr.trim()) {
      const a = Number(String(annualIncomeStr).replace(",", "."));
      if (!Number.isFinite(a) || a < 0) {
        setErr("Сумма дохода с одной бумаги — неотрицательное число");
        return;
      }
      if (incomePeriodYear) annualIncomePerUnitRub = a;
      else monthlyIncomePerUnitRub = a;
    } else if (
      invQuoteMeta?.annualIncomePerUnitRub != null &&
      invQuoteMeta.annualIncomePerUnitRub > 0
    ) {
      annualIncomePerUnitRub = invQuoteMeta.annualIncomePerUnitRub;
    }
    setBusy(true);
    const res = await createHolding({
      name: name.trim(),
      assetKind,
      units,
      pricePerUnitRub: price,
      ...(invQuoteMeta
        ? {
            quoteSource: invQuoteMeta.quoteSource,
            quoteExternalId: invQuoteMeta.quoteExternalId,
            quoteMoexMarket: invQuoteMeta.quoteMoexMarket,
          }
        : {}),
      ...(annualIncomePerUnitRub !== undefined
        ? { annualIncomePerUnitRub }
        : {}),
      ...(monthlyIncomePerUnitRub !== undefined
        ? { monthlyIncomePerUnitRub }
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
    setIncomePeriodYear(true);
    setInvQuoteMeta(null);
    setModal(false);
    void load(false);
    onPortfolioChange();
  }

  async function onSaveIncome(e: FormEvent) {
    e.preventDefault();
    if (!incomeModal) return;
    const raw = incomeModalStr.trim();
    const payload =
      raw === ""
        ? ({
            annualIncomePerUnitRub: null,
            monthlyIncomePerUnitRub: null,
            annualCouponDividendRub: null,
          } as const)
        : (() => {
            const a = Number(raw.replace(",", "."));
            if (!Number.isFinite(a) || a < 0) {
              setErr("Доход с одной бумаги — неотрицательное число");
              return null;
            }
            return incomeModalIsYear
              ? ({ annualIncomePerUnitRub: a } as const)
              : ({ monthlyIncomePerUnitRub: a } as const);
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
    void load(false);
    onPortfolioChange();
  }

  async function onDel(id: string) {
    if (!confirm("Удалить позицию?")) return;
    const r = await deleteHolding(id);
    if (!r.ok) {
      setErr(errorMessage(r.data));
      return;
    }
    void load(false);
    onPortfolioChange();
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
            <span className="finance-inv__hero-label">Оценка бумаг</span>
            <span className="finance-inv__hero-val">
              {formatRubFromMinor(data.totalValueMinor)}
            </span>
            <DepositSavingsCarousel
              accounts={data.depositSavingsAccounts}
              title="Вклады и накопительные"
            />
            <div
              className="finance-inv__alloc"
              aria-label="Доли портфеля без карт"
            >
              <h3 className="finance__h3 finance-inv__alloc-title">
                Структура портфеля
              </h3>
              <p className="finance-inv__alloc-note">
                Доли считаются по вкладам, накопительным счетам и инвестициям.
                Карты, наличные и обычные счета в проценты не входят.
              </p>
              <ul className="finance-inv__alloc-list">
                <li>
                  <span>Вклады</span>
                  <span>
                    {formatRubFromMinor(data.allocation.depositsMinor)} ·{" "}
                    {data.allocation.pctDeposits}%
                  </span>
                </li>
                <li>
                  <span>Накопительные счета</span>
                  <span>
                    {formatRubFromMinor(data.allocation.savingsMinor)} ·{" "}
                    {data.allocation.pctSavings}%
                  </span>
                </li>
                <li>
                  <span>Акции</span>
                  <span>
                    {formatRubFromMinor(data.allocation.stocksMinor)} ·{" "}
                    {data.allocation.pctStocks}%
                  </span>
                </li>
                <li>
                  <span>Облигации</span>
                  <span>
                    {formatRubFromMinor(data.allocation.bondsMinor)} ·{" "}
                    {data.allocation.pctBonds}%
                  </span>
                </li>
                <li>
                  <span>Прочие инструменты</span>
                  <span>
                    {formatRubFromMinor(
                      data.allocation.otherInstrumentsMinor,
                    )}{" "}
                    · {data.allocation.pctOtherInstruments}%
                  </span>
                </li>
              </ul>
            </div>
            <ul className="finance-inv__metrics" aria-label="Доходность по купонам и дивидендам">
              <li className="finance-inv__metric">
                <span className="finance-inv__metric-label">
                  На вложенные 1000 ₽ в бумаги (в год, оценка)
                </span>
                <span className="finance-inv__metric-val">
                  {data.metrics.incomePer1000YearMinor != null
                    ? formatRubFromMinor(data.metrics.incomePer1000YearMinor)
                    : "—"}
                </span>
              </li>
              <li className="finance-inv__metric">
                <span className="finance-inv__metric-label">
                  Вклады и накопительные (в месяц, по ставке)
                </span>
                <span className="finance-inv__metric-val">
                  {data.metrics.depositSavingsIncomeMonthMinor > 0
                    ? formatRubFromMinor(
                        data.metrics.depositSavingsIncomeMonthMinor,
                      )
                    : "—"}
                </span>
              </li>
              <li className="finance-inv__metric">
                <span className="finance-inv__metric-label">
                  Бумаги: в день (купоны и дивиденды)
                </span>
                <span className="finance-inv__metric-val">
                  {data.metrics.couponDividendDayMinor != null
                    ? formatRubFromMinor(data.metrics.couponDividendDayMinor)
                    : "—"}
                </span>
              </li>
              <li className="finance-inv__metric">
                <span className="finance-inv__metric-label">
                  Бумаги: в месяц
                </span>
                <span className="finance-inv__metric-val">
                  {data.metrics.couponDividendMonthMinor != null
                    ? formatRubFromMinor(data.metrics.couponDividendMonthMinor)
                    : "—"}
                </span>
              </li>
              <li className="finance-inv__metric">
                <span className="finance-inv__metric-label">
                  Бумаги: в год
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
              setInvQuoteMeta(null);
              setAnnualIncomeStr("");
              setIncomePeriodYear(true);
              setModal(true);
            }}
          >
            Добавить позицию
          </button>
          <h3 className="finance__h3 finance-inv__main-portfolio-title">
            Основной портфель
          </h3>
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
                    {h.annualCashflowTotalMinor > 0 ? (
                      <span className="finance-inv__meta finance-inv__meta--inc">
                        {h.annualIncomePerUnitMinor != null &&
                        h.annualIncomePerUnitMinor > 0 ? (
                          <>
                            С 1 шт:{" "}
                            {formatRubFromMinor(h.annualIncomePerUnitMinor)}
                            /год (~{" "}
                            {formatRubFromMinor(
                              Math.round(h.annualIncomePerUnitMinor / 12),
                            )}
                            /мес) · итого{" "}
                            {formatRubFromMinor(h.annualCashflowTotalMinor)}
                            /год (~{" "}
                            {formatRubFromMinor(
                              Math.round(h.annualCashflowTotalMinor / 12),
                            )}
                            /мес)
                          </>
                        ) : (
                          <>
                            Купон/див (на позицию):{" "}
                            {formatRubFromMinor(h.annualCashflowTotalMinor)}
                            /год
                          </>
                        )}
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
                        setIncomeModalIsYear(true);
                        setIncomeModalStr(
                          h.annualIncomePerUnitMinor != null &&
                            h.annualIncomePerUnitMinor > 0
                            ? String(h.annualIncomePerUnitMinor / 100)
                            : h.annualCouponDividendMinor != null &&
                                h.annualCouponDividendMinor > 0 &&
                                h.units > 0
                              ? String(
                                  h.annualCouponDividendMinor /
                                    h.units /
                                    100,
                                )
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
                  if (p.quoteSource && p.quoteExternalId) {
                    setInvQuoteMeta({
                      quoteSource: p.quoteSource,
                      quoteExternalId: p.quoteExternalId,
                      quoteMoexMarket: p.quoteMoexMarket ?? null,
                      annualIncomePerUnitRub: p.annualIncomePerUnitRub,
                    });
                  } else {
                    setInvQuoteMeta(null);
                  }
                  if (
                    p.annualIncomePerUnitRub != null &&
                    p.annualIncomePerUnitRub > 0
                  ) {
                    setAnnualIncomeStr(String(p.annualIncomePerUnitRub));
                    setIncomePeriodYear(true);
                  }
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
              <div
                className="finance-addop__carousel finance-invquote__modes"
                role="tablist"
                aria-label="Период дохода с одной бумаги"
              >
                <button
                  type="button"
                  role="tab"
                  className={
                    incomePeriodYear
                      ? "finance-addop__chip finance-addop__chip--on"
                      : "finance-addop__chip"
                  }
                  onClick={() => setIncomePeriodYear(true)}
                >
                  В год
                </button>
                <button
                  type="button"
                  role="tab"
                  className={
                    !incomePeriodYear
                      ? "finance-addop__chip finance-addop__chip--on"
                      : "finance-addop__chip"
                  }
                  onClick={() => setIncomePeriodYear(false)}
                >
                  В месяц
                </button>
              </div>
              <label className="finance__field">
                Ожидаемый купон/див с одной бумаги, ₽ (
                {incomePeriodYear ? "в год" : "в месяц"})
                <input
                  className="finance__input"
                  inputMode="decimal"
                  placeholder="необязательно; из поиска — обычно в год"
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
              aria-label="Доход с одной бумаги"
            >
              <div className="finance__modal">
                <div className="finance__modal-head">
                  <h2 className="finance__h2">Доход с одной бумаги</h2>
                  <button
                    type="button"
                    className="finance__modal-close"
                    onClick={() => setIncomeModal(null)}
                  >
                    Закрыть
                  </button>
                </div>
                <p className="finance-inv__edit-name">{incomeModal.name}</p>
                <p className="finance-inv__hint">
                  Итого по позиции = значение с одной бумаги ×{" "}
                  {incomeModal.units} шт. (годовой эквивалент хранится в базе).
                </p>
                <form
                  className="finance__form"
                  onSubmit={(e) => void onSaveIncome(e)}
                >
                  <div
                    className="finance-addop__carousel finance-invquote__modes"
                    role="tablist"
                    aria-label="Период дохода"
                  >
                    <button
                      type="button"
                      role="tab"
                      className={
                        incomeModalIsYear
                          ? "finance-addop__chip finance-addop__chip--on"
                          : "finance-addop__chip"
                      }
                      onClick={() => {
                        if (!incomeModalIsYear) {
                          const v = Number(incomeModalStr.replace(",", "."));
                          if (Number.isFinite(v) && v >= 0) {
                            setIncomeModalStr(
                              String(Math.round(v * 12 * 10000) / 10000),
                            );
                          }
                        }
                        setIncomeModalIsYear(true);
                      }}
                    >
                      В год
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={
                        !incomeModalIsYear
                          ? "finance-addop__chip finance-addop__chip--on"
                          : "finance-addop__chip"
                      }
                      onClick={() => {
                        if (incomeModalIsYear) {
                          const v = Number(incomeModalStr.replace(",", "."));
                          if (Number.isFinite(v) && v >= 0) {
                            setIncomeModalStr(
                              String(Math.round((v / 12) * 10000) / 10000),
                            );
                          }
                        }
                        setIncomeModalIsYear(false);
                      }}
                    >
                      В месяц
                    </button>
                  </div>
                  <label className="finance__field">
                    С одной бумаги, ₽ (
                    {incomeModalIsYear ? "в год" : "в месяц"})
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
  const [forecast, setForecast] = useState<ReportingForecast | null>(null);
  const [forecastErr, setForecastErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    void (async () => {
      setPending(true);
      setErr(null);
      setForecastErr(null);
      const [fc, r] = await Promise.all([
        fetchReportingForecast(),
        fetchSummaryByCategory(month),
      ]);
      setPending(false);
      if (fc.ok) {
        setForecast(fc.data);
      } else {
        setForecast(null);
        setForecastErr(errorMessage(fc.data));
      }
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
      <section
        className="finance-an__forecast"
        aria-label="Прогноз по отчётному периоду"
      >
        <h3 className="finance__h3">Ожидаемый бюджет к концу периода</h3>
        <p className="finance-an__forecast-hint">
          Среднедневные доход и расход считаются по операциям с начала текущего
          отчётного периода (см. главный экран). Прогноз линейный: чистый
          дневной × оставшиеся дни + уже накопленный баланс периода.
        </p>
        {forecastErr ? <p className="finance__err">{forecastErr}</p> : null}
        {forecast ? (
          <div className="finance-an__forecast-body">
            <p className="finance-an__forecast-period">
              До{" "}
              <strong>
                {formatRuDateShort(`${forecast.periodLastDay}T12:00:00.000Z`)}
              </strong>
              {" · "}
              следующая отчётная дата:{" "}
              <strong>
                {formatRuDateShort(`${forecast.nextReportingDay}T12:00:00.000Z`)}
              </strong>
            </p>
            <ul className="finance-an__forecast-stats">
              <li>
                Среднедневной доход:{" "}
                {formatRubFromMinor(forecast.avgDailyIncomeMinor)}
              </li>
              <li>
                Среднедневной расход:{" "}
                {formatRubFromMinor(forecast.avgDailyExpenseMinor)}
              </li>
              <li>
                Среднедневной чистый поток:{" "}
                {formatRubFromMinor(forecast.avgDailyNetMinor)}
              </li>
              <li>
                Дней в периоде прошло: {forecast.daysElapsed}, осталось:{" "}
                {forecast.daysRemaining}
              </li>
              <li>
                Уже (доход − расход):{" "}
                {formatRubFromMinor(forecast.realizedNetMinor)}
              </li>
            </ul>
            <p className="finance-an__forecast-result">
              Ожидаемый чистый результат к последнему дню периода:{" "}
              <strong>
                {formatRubFromMinor(forecast.projectedNetEndMinor)}
              </strong>
              {forecast.projectedNetEndMinor > 0
                ? " — прогноз в плюсе"
                : forecast.projectedNetEndMinor < 0
                  ? " — прогноз в минусе"
                  : ""}
            </p>
          </div>
        ) : null}
      </section>
      <label className="finance__month">
        <span className="finance__month-label">
          Календарный месяц (категории)
        </span>
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
