import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createCategory,
  createTransaction,
  deleteTransaction,
  errorMessage,
  fetchCategories,
  fetchSummary,
  fetchTransactions,
  patchCategory,
  type Category,
  type TransactionKind,
  type TransactionRow,
} from "../lib/financeApi";
import { currentMonthYm, formatRubFromMinor } from "../lib/money";

const TYPE_LABEL: Record<string, string> = {
  EXPENSE: "Расход",
  INCOME: "Доход",
  BOTH: "Оба",
};

function categoryOptionsForKind(cats: Category[], kind: TransactionKind) {
  return cats.filter(
    (c) => !c.isArchived && (c.type === kind || c.type === "BOTH"),
  );
}

export default function FinanceScreen() {
  const [month, setMonth] = useState(currentMonthYm);
  const [summary, setSummary] = useState<{
    incomeMinor: number;
    expenseMinor: number;
    balanceMinor: number;
  } | null>(null);
  /** Активные категории — для формы добавления операции */
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);

  const [kind, setKind] = useState<TransactionKind>("EXPENSE");
  const [amountStr, setAmountStr] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [occurredDate, setOccurredDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);

  const [catModal, setCatModal] = useState(false);
  const [catIncludeArchived, setCatIncludeArchived] = useState(false);
  const [modalCategories, setModalCategories] = useState<Category[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<"EXPENSE" | "INCOME" | "BOTH">(
    "EXPENSE",
  );
  const [catBusy, setCatBusy] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  const refreshMain = useCallback(async () => {
    setLoadError(null);
    setPending(true);
    const [s, c, t] = await Promise.all([
      fetchSummary(month),
      fetchCategories(false),
      fetchTransactions(),
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
    setSummary({
      incomeMinor: s.data.incomeMinor,
      expenseMinor: s.data.expenseMinor,
      balanceMinor: s.data.balanceMinor,
    });
    setCategories(c.data.categories);
    setTransactions(t.data.transactions);
  }, [month]);

  useEffect(() => {
    void refreshMain();
  }, [refreshMain]);

  useEffect(() => {
    if (!catModal) return;
    void (async () => {
      const r = await fetchCategories(catIncludeArchived);
      if (r.ok) setModalCategories(r.data.categories);
    })();
  }, [catModal, catIncludeArchived]);

  const pickable = useMemo(
    () => categoryOptionsForKind(categories, kind),
    [categories, kind],
  );

  useEffect(() => {
    if (pickable.length && !pickable.some((c) => c.id === categoryId)) {
      setCategoryId(pickable[0]?.id ?? "");
    }
  }, [pickable, categoryId]);

  async function onSubmitTx(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
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
      categoryId,
      kind,
      amountRub,
      note: note.trim() || undefined,
      occurredAt: `${occurredDate}T12:00:00.000Z`,
    });
    setFormBusy(false);
    if (!res.ok) {
      setFormError(errorMessage(res.data));
      return;
    }
    setAmountStr("");
    setNote("");
    await refreshMain();
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
    await refreshMain();
  }

  async function onAddCategory(e: FormEvent) {
    e.preventDefault();
    setCatError(null);
    setCatBusy(true);
    const res = await createCategory(newCatName.trim(), newCatType);
    setCatBusy(false);
    if (!res.ok) {
      setCatError(errorMessage(res.data));
      return;
    }
    setNewCatName("");
    await refreshMain();
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
    await refreshMain();
    const r = await fetchCategories(catIncludeArchived);
    if (r.ok) setModalCategories(r.data.categories);
  }

  return (
    <div className="screen finance">
      <div className="finance__head">
        <h1 className="screen__title">Финансы</h1>
        <button
          type="button"
          className="finance__btn-secondary"
          onClick={() => setCatModal(true)}
        >
          Категории
        </button>
      </div>

      {loadError ? <p className="finance__err">{loadError}</p> : null}
      {pending ? <p className="screen__text">Загрузка…</p> : null}

      {!pending && summary ? (
        <section className="finance__summary" aria-label="Сводка за месяц">
          <label className="finance__month">
            <span className="finance__month-label">Месяц</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          <div className="finance__tiles">
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
        <section className="finance__add" aria-label="Новая операция">
          <h2 className="finance__h2">Добавить</h2>
          <div className="finance__kind-toggle" role="group" aria-label="Тип">
            <button
              type="button"
              className={
                kind === "EXPENSE"
                  ? "finance__kind finance__kind--on"
                  : "finance__kind"
              }
              onClick={() => setKind("EXPENSE")}
            >
              Расход
            </button>
            <button
              type="button"
              className={
                kind === "INCOME"
                  ? "finance__kind finance__kind--on"
                  : "finance__kind"
              }
              onClick={() => setKind("INCOME")}
            >
              Доход
            </button>
          </div>
          <form className="finance__form" onSubmit={(e) => void onSubmitTx(e)}>
            <label className="finance__field">
              Сумма, ₽
              <input
                className="finance__input"
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                required
              />
            </label>
            <label className="finance__field">
              Категория
              <select
                className="finance__input"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
              >
                {pickable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.isBuiltIn ? "" : " · своя"}
                  </option>
                ))}
              </select>
            </label>
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
                placeholder="Необязательно"
              />
            </label>
            {formError ? <p className="finance__err">{formError}</p> : null}
            <button className="finance__submit" type="submit" disabled={formBusy}>
              {formBusy ? "Сохраняем…" : "Сохранить"}
            </button>
          </form>
        </section>
      ) : null}

      {!pending ? (
        <section className="finance__list" aria-label="Операции">
          <h2 className="finance__h2">Последние операции</h2>
          {transactions.length === 0 ? (
            <p className="screen__text">Пока пусто — добавьте первую операцию.</p>
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

      {catModal ? (
        <div
          className="finance__modal-back"
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
        </div>
      ) : null}
    </div>
  );
}
