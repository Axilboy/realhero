import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import InvestQuotePicker from "../components/InvestQuotePicker";
import { useShellTabIndex } from "../context/ShellTabContext";

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
  fetchTransfers,
  mergeAccountInto,
  patchAccount,
  patchFinanceSettings,
  purgeAccount,
  patchCategory,
  patchHolding,
  type AccountRow,
  type AccountType,
  type Category,
  type DepositSavingsAccountRow,
  type FinanceReportingGranularity,
  type InvestmentAssetKind,
  type InvestmentHoldingRow,
  type InvestAllocation,
  type ReportingForecast,
  type TransactionKind,
  type TransactionRow,
  type TransferRow,
} from "../lib/financeApi";
import { currentMonthYm, formatRubFromMinor } from "../lib/money";

const TYPE_LABEL: Record<string, string> = {
  EXPENSE: "Расход",
  INCOME: "Доход",
  BOTH: "Оба",
};

type AccountDetailItem =
  | { kind: "tx"; at: string; tx: TransactionRow }
  | { kind: "transfer"; at: string; tr: TransferRow };

function mergeAccountMovements(
  transactions: TransactionRow[],
  transfers: TransferRow[],
): AccountDetailItem[] {
  const items: AccountDetailItem[] = [
    ...transactions.map((tx) => ({
      kind: "tx" as const,
      at: tx.occurredAt,
      tx,
    })),
    ...transfers.map((tr) => ({
      kind: "transfer" as const,
      at: tr.occurredAt,
      tr,
    })),
  ];
  items.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
  return items;
}

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

type AccountCardLike = Pick<
  AccountRow,
  | "id"
  | "name"
  | "type"
  | "balanceMinor"
  | "annualInterestPercent"
  | "interestIncomeMonthMinor"
  | "interestIncomeYearMinor"
>;

function accountSupportsInterestField(t: AccountType): boolean {
  return isDepositOrSavings(t) || t === "BANK";
}

const GRANULARITY_LABEL: Record<FinanceReportingGranularity, string> = {
  DAY: "День",
  WEEK: "Неделя",
  MONTH: "Месяц",
  YEAR: "Год",
  CUSTOM: "Своя",
};

const REP_CUSTOM_FROM_LS = "rh_fin_rep_custom_from";
const REP_CUSTOM_TO_LS = "rh_fin_rep_custom_to";

function reportingCustomRangeOpts(st: {
  financeReportingGranularity: FinanceReportingGranularity;
  financeReportingCustomFrom?: string | null;
  financeReportingCustomTo?: string | null;
}): { from: string; to: string } | undefined {
  if (st.financeReportingGranularity !== "CUSTOM") return undefined;
  let f = st.financeReportingCustomFrom?.trim() ?? "";
  let t = st.financeReportingCustomTo?.trim() ?? "";
  if (!f || !t) {
    try {
      f = localStorage.getItem(REP_CUSTOM_FROM_LS) ?? "";
      t = localStorage.getItem(REP_CUSTOM_TO_LS) ?? "";
    } catch {
      /* ignore */
    }
  }
  if (f && t) return { from: f, to: t };
  return undefined;
}

/** Индекс вкладки «Финансы» в AppShell.TABS */
const SHELL_TAB_FINANCE = 1;

function formatRuDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function accountShowsInterestLines(a: AccountCardLike): boolean {
  return (
    a.type === "DEPOSIT" ||
    a.type === "SAVINGS" ||
    (a.type === "BANK" &&
      a.annualInterestPercent != null &&
      Number(a.annualInterestPercent) > 0)
  );
}

/** Одна горизонтальная карусель: все счета одного размера + опционально карточка «+». */
function FinanceAccountsRow({
  accounts,
  title,
  onOpenAccount,
  onAddAccount,
}: {
  accounts: AccountRow[];
  title: string;
  onOpenAccount?: (id: string) => void;
  onAddAccount?: () => void;
}) {
  const sorted = [...accounts].sort((a, b) =>
    a.sortOrder !== b.sortOrder
      ? a.sortOrder - b.sortOrder
      : a.name.localeCompare(b.name, "ru"),
  );
  const showAdd = onAddAccount != null;
  const renderAccountCard = (a: AccountRow) => {
    const interest = accountShowsInterestLines(a);
    const inner = (
      <>
        <div className="finance-acc-row__type">{ACCOUNT_TYPE_LABEL[a.type]}</div>
        <div className="finance-acc-row__name">{a.name}</div>
        <div className="finance-acc-row__bal">
          {formatRubFromMinor(a.balanceMinor)}
        </div>
        {interest ? (
          <>
            {a.annualInterestPercent != null &&
            Number(a.annualInterestPercent) > 0 ? (
              <div className="finance-acc-row__rate">
                {Number(a.annualInterestPercent).toLocaleString("ru-RU", {
                  maximumFractionDigits: 2,
                })}
                % годовых
              </div>
            ) : (
              <div className="finance-acc-row__rate finance-acc-row__rate--muted">
                Ставка не задана
              </div>
            )}
            <div className="finance-acc-row__inc">
              ~ {formatRubFromMinor(a.interestIncomeMonthMinor)}/мес · ~{" "}
              {formatRubFromMinor(a.interestIncomeYearMinor ?? 0)}/год
            </div>
          </>
        ) : null}
      </>
    );
    return onOpenAccount ? (
      <button
        key={a.id}
        type="button"
        className="finance-acc-row__card"
        role="listitem"
        onClick={() => onOpenAccount(a.id)}
      >
        {inner}
      </button>
    ) : (
      <div key={a.id} className="finance-acc-row__card" role="listitem">
        {inner}
      </div>
    );
  };

  return (
    <div className="finance-acc-row-wrap">
      <h3 className="finance__h3 finance-acc-row__title">{title}</h3>
      <div className="finance-acc-row__scroll" role="list">
        {sorted.length === 0 && showAdd ? (
          <button
            type="button"
            className="finance-acc-row__card finance-acc-row__card--add"
            onClick={onAddAccount}
          >
            <span className="finance-acc-row__plus" aria-hidden>
              +
            </span>
            <span className="finance-acc-row__add-tx">Новый счёт</span>
          </button>
        ) : (
          <>
            {sorted.map((a) => renderAccountCard(a))}
            {showAdd ? (
              <button
                type="button"
                className="finance-acc-row__card finance-acc-row__card--add"
                onClick={onAddAccount}
                aria-label="Новый счёт"
              >
                <span className="finance-acc-row__plus" aria-hidden>
                  +
                </span>
              </button>
            ) : null}
          </>
        )}
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
    (c) =>
      !c.isArchived &&
      !c.excludeFromReporting &&
      (c.type === kind || c.type === "BOTH"),
  );
}

type TabKey = 0 | 1 | 2;

export default function FinanceModule() {
  const shellTab = useShellTabIndex();
  const [tab, setTab] = useState<TabKey>(0);
  const [bump, setBump] = useState(0);
  const [mainSettingsOpen, setMainSettingsOpen] = useState(false);
  const refreshAll = useCallback(() => setBump((x) => x + 1), []);
  const financeScreenActive = shellTab === SHELL_TAB_FINANCE;

  return (
    <div className="finance-mod">
      <div className="finance-mod__head finance-mod__head--row">
        <h1 className="screen__title finance-mod__title">Финансы</h1>
        {tab === 0 ? (
          <button
            type="button"
            className="finance-mod__gear"
            aria-label="Настройки"
            onClick={() => setMainSettingsOpen(true)}
          >
            ⚙
          </button>
        ) : (
          <span className="finance-mod__gear-spacer" aria-hidden />
        )}
      </div>

      <div className="finance-mod__swipe">
        <div
          className="finance-mod__track"
          style={{ transform: `translateY(-${(tab * 100) / 3}%)` }}
        >
          <div className="finance-mod__panel">
            <FinanceMainPanel
              bump={bump}
              onRefresh={refreshAll}
              settingsOpen={mainSettingsOpen}
              onSettingsOpenChange={setMainSettingsOpen}
              fabVisible={financeScreenActive && tab === 0}
            />
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

function parseRuSignedDecimal(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, "").replace(",", ".").replace("−", "-");
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Строка для поля «баланс в ₽» из копеек (можно с минусом). */
function minorToEditableRubStr(minor: number): string {
  const rub = minor / 100;
  if (!Number.isFinite(rub)) return "0";
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rub);
}

function FinanceMainPanel({
  bump,
  onRefresh,
  settingsOpen,
  onSettingsOpenChange,
  fabVisible,
}: {
  bump: number;
  onRefresh: () => void;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  fabVisible: boolean;
}) {
  const [reporting, setReporting] = useState<{
    financeReportingDay: number;
    financeReportingGranularity: FinanceReportingGranularity;
    periodStart: string;
    periodLastDay: string;
    incomeMinor: number;
    expenseMinor: number;
    transferOutMinor: number;
    outflowMinor: number;
    balanceMinor: number;
  } | null>(null);
  const [capAlloc, setCapAlloc] = useState<InvestAllocation | null>(null);
  const [monthlyPassiveMinor, setMonthlyPassiveMinor] = useState(0);
  const [reportingDayDraft, setReportingDayDraft] = useState("1");
  const [granularityDraft, setGranularityDraft] =
    useState<FinanceReportingGranularity>("MONTH");
  const [repCustomFrom, setRepCustomFrom] = useState(() => {
    try {
      return localStorage.getItem(REP_CUSTOM_FROM_LS) ?? "";
    } catch {
      return "";
    }
  });
  const [repCustomTo, setRepCustomTo] = useState(() => {
    try {
      return localStorage.getItem(REP_CUSTOM_TO_LS) ?? "";
    } catch {
      return "";
    }
  });
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [delModalAcc, setDelModalAcc] = useState<AccountRow | null>(null);
  const [delTargetId, setDelTargetId] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delMode, setDelMode] = useState<"merge" | "purge">("merge");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );
  const [accountDetailItems, setAccountDetailItems] = useState<
    AccountDetailItem[]
  >([]);
  const [accountDetailPending, setAccountDetailPending] = useState(false);
  const [accountEditOpen, setAccountEditOpen] = useState(false);
  const [editAccName, setEditAccName] = useState("");
  const [editAccInterestStr, setEditAccInterestStr] = useState("");
  const [editBalanceTargetStr, setEditBalanceTargetStr] = useState("");
  const [accDetailBusy, setAccDetailBusy] = useState(false);
  const [accDetailErr, setAccDetailErr] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [investmentsTotal, setInvestmentsTotal] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
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
    const st = await fetchFinanceSettings();
    let summaryOpts: { from?: string; to?: string } | undefined;
    if (st.ok) {
      try {
        localStorage.setItem(
          "rh_fin_rep_granularity",
          st.data.financeReportingGranularity,
        );
      } catch {
        /* ignore */
      }
      setGranularityDraft(st.data.financeReportingGranularity);
      setReportingDayDraft(String(st.data.financeReportingDay));
      if (st.data.financeReportingGranularity === "CUSTOM") {
        let f = "";
        let t = "";
        try {
          f = localStorage.getItem(REP_CUSTOM_FROM_LS) ?? "";
          t = localStorage.getItem(REP_CUSTOM_TO_LS) ?? "";
        } catch {
          /* ignore */
        }
        if (f && t) summaryOpts = { from: f, to: t };
      }
    }

    const [rep, c, a, ov] = await Promise.all([
      fetchReportingSummary(summaryOpts),
      fetchCategories(false),
      fetchAccounts(),
      fetchInvestOverview(false),
    ]);
    setPending(false);

    const errs: string[] = [];
    if (!st.ok) errs.push(errorMessage(st.data));
    if (rep.ok) {
      setReporting({
        financeReportingDay: rep.data.financeReportingDay,
        financeReportingGranularity: rep.data.financeReportingGranularity,
        periodStart: rep.data.periodStart,
        periodLastDay: rep.data.periodLastDay,
        incomeMinor: rep.data.incomeMinor,
        expenseMinor: rep.data.expenseMinor,
        transferOutMinor: rep.data.transferOutMinor ?? 0,
        outflowMinor:
          rep.data.outflowMinor ??
          rep.data.expenseMinor + (rep.data.transferOutMinor ?? 0),
        balanceMinor: rep.data.balanceMinor,
      });
    } else {
      errs.push(errorMessage(rep.data));
    }
    if (c.ok) setCategories(c.data.categories);
    else errs.push(errorMessage(c.data));
    if (a.ok) {
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
    } else errs.push(errorMessage(a.data));

    if (ov.ok) {
      setCapAlloc(ov.data.allocation);
      const dep = ov.data.metrics.depositSavingsIncomeMonthMinor;
      const sec = ov.data.metrics.couponDividendMonthMinor ?? 0;
      setMonthlyPassiveMinor(dep + sec);
    } else {
      setCapAlloc(null);
      setMonthlyPassiveMinor(0);
    }

    if (errs.length) setLoadError(errs[0]);
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
    await refresh();
    onRefresh();
    if (catModal) {
      const r = await fetchCategories(catIncludeArchived);
      if (r.ok) setModalCategories(r.data.categories);
    }
  }

  async function onDeleteAccountDetailTx(txId: string) {
    if (!confirm("Удалить операцию?")) return;
    const accId = selectedAccountId;
    const res = await deleteTransaction(txId);
    if (!res.ok) {
      setAccDetailErr(errorMessage(res.data));
      return;
    }
    await refresh();
    onRefresh();
    if (accId) {
      const [rTx, rTr] = await Promise.all([
        fetchTransactions({ accountId: accId }),
        fetchTransfers({ accountId: accId }),
      ]);
      if (rTx.ok && rTr.ok) {
        setAccountDetailItems(
          mergeAccountMovements(rTx.data.transactions, rTr.data.transfers),
        );
      }
    }
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
    await refresh();
    onRefresh();
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
    await refresh();
    onRefresh();
    const r = await fetchCategories(catIncludeArchived);
    if (r.ok) setModalCategories(r.data.categories);
  }

  async function onAddAccount(ev: FormEvent) {
    ev.preventDefault();
    setAccError(null);
    let annualInterestPercent: number | null | undefined;
    if (accountSupportsInterestField(newAccType)) {
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
      ...(accountSupportsInterestField(newAccType)
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
    await refresh();
    onRefresh();
  }

  function openDelModal(acc: AccountRow) {
    setLoadError(null);
    setDelMode("merge");
    setDelModalAcc(acc);
    const others = accounts.filter((x) => x.id !== acc.id);
    setDelTargetId(others[0]?.id ?? "");
  }

  async function confirmMergeDelete() {
    if (!delModalAcc || !delTargetId || delModalAcc.id === delTargetId) return;
    const goneId = delModalAcc.id;
    setDelBusy(true);
    setLoadError(null);
    const res = await mergeAccountInto(goneId, delTargetId);
    setDelBusy(false);
    if (!res.ok) {
      setLoadError(errorMessage(res.data));
      return;
    }
    setDelModalAcc(null);
    if (selectedAccountId === goneId) closeAccountDetail();
    await refresh();
    onRefresh();
  }

  async function onSaveReportingSettings(e: FormEvent) {
    e.preventDefault();
    const n = Number(String(reportingDayDraft).replace(",", "."));
    if (!Number.isFinite(n) || n < 1 || n > 28) {
      setLoadError("Отчётное число — целое от 1 до 28");
      return;
    }
    if (granularityDraft === "CUSTOM") {
      if (!repCustomFrom || !repCustomTo) {
        setLoadError("Укажите даты начала и конца для «Своя»");
        return;
      }
      if (repCustomFrom > repCustomTo) {
        setLoadError("Дата начала не позже даты конца");
        return;
      }
    }
    setSettingsBusy(true);
    setLoadError(null);
    const r = await patchFinanceSettings({
      financeReportingDay: Math.floor(n),
      financeReportingGranularity: granularityDraft,
      ...(granularityDraft === "CUSTOM"
        ? {
            financeReportingCustomFrom: repCustomFrom.trim(),
            financeReportingCustomTo: repCustomTo.trim(),
          }
        : {
            financeReportingCustomFrom: null,
            financeReportingCustomTo: null,
          }),
    });
    setSettingsBusy(false);
    if (!r.ok) {
      setLoadError(errorMessage(r.data));
      return;
    }
    if (granularityDraft === "CUSTOM") {
      try {
        localStorage.setItem(REP_CUSTOM_FROM_LS, repCustomFrom);
        localStorage.setItem(REP_CUSTOM_TO_LS, repCustomTo);
      } catch {
        /* ignore */
      }
    }
    await refresh();
    onRefresh();
  }

  const selectedAccount = selectedAccountId
    ? accounts.find((x) => x.id === selectedAccountId) ?? null
    : null;

  useEffect(() => {
    if (!selectedAccountId) {
      setAccountDetailItems([]);
      return;
    }
    setAccDetailErr(null);
    setAccountDetailPending(true);
    void (async () => {
      const [rTx, rTr] = await Promise.all([
        fetchTransactions({ accountId: selectedAccountId }),
        fetchTransfers({ accountId: selectedAccountId }),
      ]);
      setAccountDetailPending(false);
      if (rTx.ok && rTr.ok) {
        setAccDetailErr(null);
        setAccountDetailItems(
          mergeAccountMovements(rTx.data.transactions, rTr.data.transfers),
        );
      } else {
        setAccountDetailItems([]);
        setAccDetailErr(
          !rTx.ok
            ? errorMessage(rTx.data)
            : errorMessage(rTr.data),
        );
      }
    })();
  }, [selectedAccountId, bump]);

  function openAccountDetail(id: string) {
    setAccDetailErr(null);
    setAccountEditOpen(false);
    setSelectedAccountId(id);
    const acc = accounts.find((x) => x.id === id);
    if (acc) {
      setEditAccName(acc.name);
      setEditAccInterestStr(
        acc.annualInterestPercent != null
          ? String(acc.annualInterestPercent)
          : "",
      );
      setEditBalanceTargetStr("");
    }
  }

  function closeAccountDetail() {
    setSelectedAccountId(null);
    setAccountEditOpen(false);
    setAccDetailErr(null);
  }

  async function onSaveAccountEdit() {
    if (!selectedAccount) return;
    const name = editAccName.trim();
    if (!name || name.length > 80) {
      setAccDetailErr("Название 1–80 символов");
      return;
    }
    let annualInterestPercent: number | null | undefined;
    if (accountSupportsInterestField(selectedAccount.type)) {
      const s = editAccInterestStr.trim();
      if (s === "") annualInterestPercent = null;
      else {
        const p = Number(s.replace(",", "."));
        if (!Number.isFinite(p) || p < 0 || p > 1000) {
          setAccDetailErr("Ставка % — от 0 до 1000 или пусто");
          return;
        }
        annualInterestPercent = p;
      }
    }
    const currentMinor =
      accounts.find((a) => a.id === selectedAccount.id)?.balanceMinor ??
      selectedAccount.balanceMinor;

    setAccDetailBusy(true);
    setAccDetailErr(null);
    const pr = await patchAccount(selectedAccount.id, {
      name,
      ...(accountSupportsInterestField(selectedAccount.type)
        ? { annualInterestPercent }
        : {}),
    });
    if (!pr.ok) {
      setAccDetailBusy(false);
      setAccDetailErr(errorMessage(pr.data));
      return;
    }

    const balStr = editBalanceTargetStr.trim();
    if (balStr !== "" && balStr !== "-" && balStr !== "−") {
      const targetRub = parseRuSignedDecimal(editBalanceTargetStr);
      if (targetRub === null) {
        setAccDetailBusy(false);
        setAccDetailErr("Баланс — число в ₽ (можно с минусом)");
        return;
      }
      const targetMinor = Math.round(targetRub * 100);
      const deltaMinor = targetMinor - currentMinor;
      if (deltaMinor !== 0) {
        const adjCat = categories.find((cat) => cat.excludeFromReporting === true);
        if (!adjCat) {
          setAccDetailBusy(false);
          setAccDetailErr(
            "Нет служебной категории корректировки. Обновите страницу.",
          );
          return;
        }
        const kind = deltaMinor > 0 ? "INCOME" : "EXPENSE";
        const amountRub = Math.abs(deltaMinor) / 100;
        const tr = await createTransaction({
          accountId: selectedAccount.id,
          categoryId: adjCat.id,
          kind,
          amountRub,
          note: "Приведение баланса счёта к введённой сумме",
          occurredAt: new Date().toISOString(),
        });
        if (!tr.ok) {
          setAccDetailBusy(false);
          setAccDetailErr(errorMessage(tr.data));
          return;
        }
      }
    }
    setAccDetailBusy(false);
    setAccountEditOpen(false);
    setEditBalanceTargetStr("");
    await refresh();
    onRefresh();
    void (async () => {
      const [rTx, rTr] = await Promise.all([
        fetchTransactions({ accountId: selectedAccount.id }),
        fetchTransfers({ accountId: selectedAccount.id }),
      ]);
      if (rTx.ok && rTr.ok) {
        setAccountDetailItems(
          mergeAccountMovements(rTx.data.transactions, rTr.data.transfers),
        );
      }
    })();
  }

  async function confirmPurgeDelete() {
    if (!delModalAcc) return;
    const goneId = delModalAcc.id;
    setDelBusy(true);
    setLoadError(null);
    const res = await purgeAccount(goneId);
    setDelBusy(false);
    if (!res.ok) {
      setLoadError(errorMessage(res.data));
      return;
    }
    setDelModalAcc(null);
    if (selectedAccountId === goneId) closeAccountDetail();
    await refresh();
    onRefresh();
  }

  return (
    <div
      className={
        fabVisible ? "finance-main finance-main--fab-pad" : "finance-main"
      }
    >
      {loadError ? <p className="finance__err">{loadError}</p> : null}
      {pending ? <p className="screen__text">Загрузка…</p> : null}

      {!pending ? (
        <FinanceAccountsRow
          accounts={accounts}
          title="Счета"
          onOpenAccount={openAccountDetail}
          onAddAccount={() => {
            setAccError(null);
            setNewAccInterestStr("");
            setAccModal(true);
          }}
        />
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
            Отчёт (
            {GRANULARITY_LABEL[reporting.financeReportingGranularity]}):{" "}
            <strong>
              {formatRuDateShort(reporting.periodStart)} —{" "}
              {formatRuDateShort(`${reporting.periodLastDay}T12:00:00.000Z`)}
            </strong>
            .{" "}
            <button
              type="button"
              className="finance-main__linkish"
              onClick={() => onSettingsOpenChange(true)}
            >
              Изменить в настройках
            </button>
          </p>
          <div className="finance__tiles finance__tiles--compact">
            <div className="finance__tile finance__tile--in">
              <span className="finance__tile-label">Доходы (период)</span>
              <span className="finance__tile-val">
                {formatRubFromMinor(reporting.incomeMinor)}
              </span>
            </div>
            <div className="finance__tile finance__tile--out">
              <span className="finance__tile-label">
                Расходы и переводы (период)
              </span>
              <span className="finance__tile-val">
                {formatRubFromMinor(reporting.outflowMinor)}
              </span>
              {reporting.expenseMinor > 0 && reporting.transferOutMinor > 0 ? (
                <span className="finance__tile-sub">
                  операции {formatRubFromMinor(reporting.expenseMinor)} ·
                  переводы {formatRubFromMinor(reporting.transferOutMinor)}
                </span>
              ) : reporting.transferOutMinor > 0 &&
                reporting.expenseMinor === 0 ? (
                <span className="finance__tile-sub">
                  только переводы между счетами
                </span>
              ) : null}
            </div>
            <div className="finance__tile finance__tile--bal">
              <span className="finance__tile-label">Баланс (период)</span>
              <span className="finance__tile-val">
                {formatRubFromMinor(reporting.balanceMinor)}
              </span>
            </div>
          </div>
          {reporting.outflowMinor === 0 ? (
            <p className="finance-main__period-hint">
              В отчёт попадают только операции и переводы, у которых дата
              попадает в указанный период. Если расходы или переводы были
              раньше или позже — здесь будет 0 ₽.
            </p>
          ) : null}
        </section>
      ) : null}

      {settingsOpen
        ? modalPortal(
            <div
              className="finance__modal-back finance__modal-root"
              role="dialog"
              aria-modal="true"
              aria-labelledby="fin-settings-title"
            >
              <div className="finance__modal finance__modal--fin-settings">
                <div className="finance__modal-head">
                  <h2 id="fin-settings-title" className="finance__h2">
                    Настройки
                  </h2>
                  <button
                    type="button"
                    className="finance__modal-close"
                    onClick={() => onSettingsOpenChange(false)}
                  >
                    Закрыть
                  </button>
                </div>
                <div className="finance-main__settings-body">
                  <h3 className="finance__h3 finance-main__settings-h3">
                    Отчётность
                  </h3>
                  <form
                    className="finance-main__reporting-settings"
                    onSubmit={(e) => void onSaveReportingSettings(e)}
                  >
                    <div
                      className="finance-main__gran-chips"
                      role="group"
                      aria-label="Шаг отчётности"
                    >
                      {(
                        [
                          "DAY",
                          "WEEK",
                          "MONTH",
                          "YEAR",
                          "CUSTOM",
                        ] as FinanceReportingGranularity[]
                      ).map((g) => (
                        <button
                          key={g}
                          type="button"
                          className={
                            granularityDraft === g
                              ? "finance-main__gran-chip finance-main__gran-chip--on"
                              : "finance-main__gran-chip"
                          }
                          onClick={() => setGranularityDraft(g)}
                        >
                          {GRANULARITY_LABEL[g]}
                        </button>
                      ))}
                    </div>
                    {granularityDraft === "MONTH" ? (
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
                    ) : null}
                    {granularityDraft === "CUSTOM" ? (
                      <div className="finance-main__custom-range">
                        <label className="finance__field">
                          С даты
                          <input
                            className="finance__input"
                            type="date"
                            value={repCustomFrom}
                            onChange={(e) => setRepCustomFrom(e.target.value)}
                          />
                        </label>
                        <label className="finance__field">
                          По дату
                          <input
                            className="finance__input"
                            type="date"
                            value={repCustomTo}
                            onChange={(e) => setRepCustomTo(e.target.value)}
                          />
                        </label>
                      </div>
                    ) : null}
                    <button
                      type="submit"
                      className="finance__submit"
                      disabled={settingsBusy}
                    >
                      {settingsBusy ? "…" : "Сохранить отчётность"}
                    </button>
                  </form>
                  <h3 className="finance__h3 finance-main__settings-h3">
                    Категории и счета
                  </h3>
                  <div className="finance-main__settings-actions">
                    <button
                      type="button"
                      className="finance__btn-secondary"
                      onClick={() => {
                        setCatError(null);
                        setCatModal(true);
                      }}
                    >
                      Категории операций
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
                </div>
              </div>
            </div>,
          )
        : null}

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
                <div className="finance-main__del-mode" role="tablist">
                  <button
                    type="button"
                    className={
                      delMode === "merge"
                        ? "finance-main__del-mode-btn finance-main__del-mode-btn--on"
                        : "finance-main__del-mode-btn"
                    }
                    onClick={() => setDelMode("merge")}
                  >
                    Перенести на другой счёт
                  </button>
                  <button
                    type="button"
                    className={
                      delMode === "purge"
                        ? "finance-main__del-mode-btn finance-main__del-mode-btn--on"
                        : "finance-main__del-mode-btn"
                    }
                    onClick={() => setDelMode("purge")}
                  >
                    Удалить полностью
                  </button>
                </div>
                {delMode === "merge" ? (
                  <>
                    <p className="finance-main__del-warn">
                      Счёт «{delModalAcc.name}» будет удалён. Операции и переводы
                      перейдут на выбранный счёт.
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
                  </>
                ) : (
                  <p className="finance-main__del-warn finance-main__del-warn--strong">
                    Счёт «{delModalAcc.name}» и все связанные операции и переводы
                    будут удалены без переноса. Остаток на счёту в учёте пропадёт
                    (переводы на другие счета тоже исчезнут из истории).
                  </p>
                )}
                {loadError ? <p className="finance__err">{loadError}</p> : null}
                {delMode === "merge" ? (
                  <button
                    type="button"
                    className="finance__submit"
                    disabled={
                      delBusy ||
                      !delTargetId ||
                      accounts.filter((x) => x.id !== delModalAcc.id)
                        .length === 0
                    }
                    onClick={() => void confirmMergeDelete()}
                  >
                    {delBusy ? "…" : "Удалить с переносом"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="finance__submit finance__submit--danger"
                    disabled={delBusy}
                    onClick={() => void confirmPurgeDelete()}
                  >
                    {delBusy ? "…" : "Удалить навсегда"}
                  </button>
                )}
              </div>
            </div>,
          )
        : null}

      {selectedAccount
        ? modalPortal(
            <div
              className="finance__modal-back finance__modal-root"
              role="dialog"
              aria-modal="true"
              aria-label={`Счёт ${selectedAccount.name}`}
            >
              <div className="finance__modal finance__modal--acc-detail">
                <div className="finance__modal-head finance__modal-head--acc">
                  <div className="finance__modal-head-acc-top">
                    <h2 className="finance__h2 finance__modal-head-acc-title">
                      {selectedAccount.name}
                    </h2>
                    <button
                      type="button"
                      className="finance__modal-close"
                      onClick={() => closeAccountDetail()}
                    >
                      Закрыть
                    </button>
                  </div>
                  {!accountEditOpen ? (
                    <div className="finance-main__acc-head-actions">
                      <button
                        type="button"
                        className="finance__btn-secondary"
                        onClick={() => {
                          setAccDetailErr(null);
                          const acc = accounts.find(
                            (a) => a.id === selectedAccount?.id,
                          );
                          if (acc) {
                            setEditBalanceTargetStr(
                              minorToEditableRubStr(acc.balanceMinor),
                            );
                          }
                          setAccountEditOpen(true);
                        }}
                      >
                        Редактировать
                      </button>
                      <button
                        type="button"
                        className="finance-main__acc-del"
                        onClick={() => openDelModal(selectedAccount)}
                      >
                        Удалить счёт
                      </button>
                    </div>
                  ) : null}
                </div>
                {!accountEditOpen ? (
                  <>
                    <p className="finance-main__acc-detail-meta">
                      {ACCOUNT_TYPE_LABEL[selectedAccount.type]} · баланс{" "}
                      {formatRubFromMinor(selectedAccount.balanceMinor)}
                    </p>
                    {accountSupportsInterestField(selectedAccount.type) ? (
                      <p className="finance-main__acc-detail-meta">
                        Ставка:{" "}
                        {selectedAccount.annualInterestPercent != null
                          ? `${Number(selectedAccount.annualInterestPercent).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}% годовых`
                          : "не задана"}
                        {" · "}
                        ~{formatRubFromMinor(selectedAccount.interestIncomeMonthMinor)}
                        /мес, ~
                        {formatRubFromMinor(
                          selectedAccount.interestIncomeYearMinor ?? 0,
                        )}
                        /год
                      </p>
                    ) : null}
                    <h3 className="finance__h3 finance-main__acc-detail-h3">
                      Операции и переводы
                    </h3>
                    {accountDetailPending ? (
                      <p className="screen__text">Загрузка…</p>
                    ) : accDetailErr && !accountEditOpen ? (
                      <p className="finance__err">{accDetailErr}</p>
                    ) : accountDetailItems.length === 0 ? (
                      <p className="screen__text">Операций и переводов нет.</p>
                    ) : (
                      <div className="finance-main__acc-tx-scroll">
                        <ul className="finance__tx-list finance-main__acc-tx-list">
                          {accountDetailItems.map((item) =>
                            item.kind === "tx" ? (
                              <li key={item.tx.id} className="finance__tx">
                                <div className="finance__tx-main">
                                  <span className="finance__tx-date">
                                    {new Date(
                                      item.tx.occurredAt,
                                    ).toLocaleDateString("ru-RU")}
                                  </span>
                                  <span className="finance__tx-cat">
                                    {item.tx.category.excludeFromReporting
                                      ? "Корректировка"
                                      : item.tx.kind === "INCOME"
                                        ? "Доход"
                                        : "Расход"}{" "}
                                    · {item.tx.category.name}
                                  </span>
                                  <span
                                    className={
                                      item.tx.category.excludeFromReporting
                                        ? "finance__tx-sum finance__tx-sum--adj"
                                        : item.tx.kind === "INCOME"
                                          ? "finance__tx-sum finance__tx-sum--in"
                                          : "finance__tx-sum finance__tx-sum--out"
                                    }
                                  >
                                    {item.tx.kind === "INCOME" ? "+" : "−"}
                                    {formatRubFromMinor(item.tx.amountMinor)}
                                  </span>
                                </div>
                                {item.tx.note ? (
                                  <p className="finance__tx-note">
                                    {item.tx.note}
                                  </p>
                                ) : null}
                                <button
                                  type="button"
                                  className="finance__tx-del"
                                  onClick={() =>
                                    void onDeleteAccountDetailTx(item.tx.id)
                                  }
                                >
                                  Удалить операцию
                                </button>
                              </li>
                            ) : (
                              <li
                                key={item.tr.id}
                                className="finance__tx finance__tx--transfer"
                              >
                                <div className="finance__tx-main">
                                  <span className="finance__tx-date">
                                    {new Date(
                                      item.tr.occurredAt,
                                    ).toLocaleDateString("ru-RU")}
                                  </span>
                                  <span className="finance__tx-cat">
                                    Перевод · {item.tr.fromAccount.name} →{" "}
                                    {item.tr.toAccount.name}
                                  </span>
                                  <span
                                    className={
                                      item.tr.fromAccountId ===
                                      selectedAccount.id
                                        ? "finance__tx-sum finance__tx-sum--out"
                                        : "finance__tx-sum finance__tx-sum--in"
                                    }
                                  >
                                    {item.tr.fromAccountId ===
                                    selectedAccount.id
                                      ? "−"
                                      : "+"}
                                    {formatRubFromMinor(item.tr.amountMinor)}
                                  </span>
                                </div>
                                {item.tr.note ? (
                                  <p className="finance__tx-note">
                                    {item.tr.note}
                                  </p>
                                ) : null}
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <form
                    className="finance__form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void onSaveAccountEdit();
                    }}
                  >
                    <label className="finance__field">
                      Название
                      <input
                        className="finance__input"
                        value={editAccName}
                        onChange={(e) => setEditAccName(e.target.value)}
                        maxLength={80}
                        required
                      />
                    </label>
                    {accountSupportsInterestField(selectedAccount.type) ? (
                      <label className="finance__field">
                        Ставка, % годовых (пусто — без ставки)
                        <input
                          className="finance__input"
                          inputMode="decimal"
                          value={editAccInterestStr}
                          onChange={(e) => setEditAccInterestStr(e.target.value)}
                          placeholder="например 9"
                        />
                      </label>
                    ) : null}
                    <label className="finance__field">
                      <span className="finance-main__balance-adj-label">
                        Текущий баланс счёта, ₽
                      </span>
                      <p className="finance-main__balance-hint">
                        Введите полную сумму на счёте (как в банке), а не
                        изменение. Если сумма не совпадает с учётом в приложении,
                        будет добавлена одна операция на разницу.
                      </p>
                      <input
                        className="finance__input"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={editBalanceTargetStr}
                        onChange={(e) =>
                          setEditBalanceTargetStr(e.target.value)
                        }
                        placeholder="например 99 445,50"
                      />
                    </label>
                    {accDetailErr ? (
                      <p className="finance__err">{accDetailErr}</p>
                    ) : null}
                    <div className="finance-main__acc-detail-actions">
                      <button
                        type="button"
                        className="finance__btn-secondary"
                        onClick={() => {
                          setAccountEditOpen(false);
                          setAccDetailErr(null);
                        }}
                      >
                        Назад
                      </button>
                      <button
                        type="submit"
                        className="finance__submit"
                        disabled={accDetailBusy}
                      >
                        {accDetailBusy ? "…" : "Сохранить"}
                      </button>
                    </div>
                  </form>
                )}
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
              {accountSupportsInterestField(newAccType) ? (
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

      {fabVisible && !pending
        ? modalPortal(
            <button
              type="button"
              className="finance-main__fab"
              onClick={() => openAddOp()}
              aria-label="Добавить операцию"
            >
              Добавить
            </button>,
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
            <FinanceAccountsRow
              accounts={data.depositSavingsAccounts.map((d, i) => ({
                ...d,
                sortOrder: i,
              })) as AccountRow[]}
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
      const st = await fetchFinanceSettings();
      const forecastOpts = st.ok
        ? reportingCustomRangeOpts(st.data)
        : undefined;
      const [fc, r] = await Promise.all([
        fetchReportingForecast(forecastOpts),
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
        aria-label="Ожидаемый баланс по отчётному периоду"
      >
        <h3 className="finance__h3">Ожидаемый баланс</h3>
        <p className="finance-an__forecast-hint">
          Весь доход за отчётный период плюс оценка пассивного дохода до конца
          периода минус прогноз расходов на весь период: средний дневной расход
          (расходы с начала периода, делённые на число прошедших дней)
          умножается на число календарных дней в периоде.
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
              <li>
                Пассивный доход до конца периода (оценка):{" "}
                {formatRubFromMinor(forecast.passiveIncomeToEndMinor)}
              </li>
              <li>
                Прогноз расходов на весь период (по среднему дневному):{" "}
                {formatRubFromMinor(forecast.expenseProjectedPeriodMinor)}
              </li>
              <li>
                Дней в периоде (календарь): {forecast.totalDaysInPeriod}
              </li>
            </ul>
            <p className="finance-an__forecast-result">
              Ожидаемый баланс (индикатор):{" "}
              <strong>
                {formatRubFromMinor(forecast.expectedBalanceIndicatorMinor)}
              </strong>
              {forecast.expectedBalanceIndicatorMinor > 0
                ? " — в плюсе"
                : forecast.expectedBalanceIndicatorMinor < 0
                  ? " — в минусе"
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
