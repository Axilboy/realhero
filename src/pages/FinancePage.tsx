import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  createTransaction,
  deleteTransaction,
  fetchFinanceSummary,
  fetchTransactions,
} from "../api/realHero";
import { useSession } from "../context/SessionContext";
import type { FinanceSummary, TransactionDto } from "../types/dashboard";
import { useSwipeBackToHome } from "../hooks/useSwipeNavigate";

function formatMinor(n: number): string {
  return (n / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function FinancePage() {
  const { user, loading: sessionLoading } = useSession();
  const [txs, setTxs] = useState<TransactionDto[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Быт");
  const [note, setNote] = useState("");
  const swipe = useSwipeBackToHome("finance", true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [list, sum] = await Promise.all([fetchTransactions(), fetchFinanceSummary(30)]);
      setTxs(list);
      setSummary(sum);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setTxs([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    void load();
  }, [user, sessionLoading, load]);

  const submit = async () => {
    const rub = parseFloat(amount.replace(",", "."));
    if (!Number.isFinite(rub) || rub <= 0) return;
    const amountMinor = Math.round(rub * 100);
    setBusy(true);
    setError(null);
    try {
      await createTransaction({
        type,
        amountMinor,
        category: category.trim() || "Прочее",
        note: note.trim() || null,
      });
      setAmount("");
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не сохранилось");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Удалить запись?")) return;
    setBusy(true);
    try {
      await deleteTransaction(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  };

  if (sessionLoading) {
    return (
      <div className="finance module module--swipe" {...swipe}>
        <p className="quests__muted">Загрузка…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="finance module module--swipe" {...swipe}>
        <header className="module__header">
          <Link to="/login" className="module__back">
            ← Войти
          </Link>
          <h1 className="module__title">Финансы</h1>
          <p className="module__subtitle">Войдите, чтобы вести учёт.</p>
        </header>
      </div>
    );
  }

  const catRows = summary
    ? Object.entries(summary.byCategory)
        .filter(([, v]) => v !== 0)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    : [];

  return (
    <div className="finance module module--swipe" {...swipe}>
      <header className="module__header">
        <Link to="/" className="module__back">
          ← Центр
        </Link>
        <h1 className="module__title">Финансы</h1>
        <p className="module__subtitle">Суммы в рублях (хранятся в копейках). Период сводки: 30 дней.</p>
      </header>

      {error ? (
        <p className="quests__error" role="alert">
          {error}
        </p>
      ) : null}

      {summary ? (
        <section className="finance__summary" aria-label="Сводка">
          <div className="finance__stat">
            <span className="finance__stat-label">Доходы</span>
            <span className="finance__stat-val finance__stat-val--plus">{formatMinor(summary.totalIncomeMinor)} ₽</span>
          </div>
          <div className="finance__stat">
            <span className="finance__stat-label">Расходы</span>
            <span className="finance__stat-val finance__stat-val--minus">{formatMinor(summary.totalExpenseMinor)} ₽</span>
          </div>
          <div className="finance__stat">
            <span className="finance__stat-label">Баланс</span>
            <span className={summary.balanceMinor >= 0 ? "finance__stat-val finance__stat-val--plus" : "finance__stat-val finance__stat-val--minus"}>
              {summary.balanceMinor >= 0 ? "+" : "−"}
              {formatMinor(Math.abs(summary.balanceMinor))} ₽
            </span>
          </div>
          {catRows.length ? (
            <ul className="finance__cats">
              {catRows.map(([name, val]) => (
                <li key={name} className="finance__cat">
                  <span>{name}</span>
                  <span className={val >= 0 ? "finance__stat-val--plus" : "finance__stat-val--minus"}>{formatMinor(Math.abs(val))} ₽</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="quests__new finance__form" aria-labelledby="fin-new">
        <h2 id="fin-new" className="quests__section-title">
          Новая операция
        </h2>
        <div className="finance__type-row">
          <label className="finance__radio">
            <input type="radio" name="ftype" checked={type === "expense"} onChange={() => setType("expense")} />
            Расход
          </label>
          <label className="finance__radio">
            <input type="radio" name="ftype" checked={type === "income"} onChange={() => setType("income")} />
            Доход
          </label>
        </div>
        <input className="quests__input" type="text" inputMode="decimal" placeholder="Сумма (руб)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className="quests__input" type="text" placeholder="Категория" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={48} />
        <input className="quests__input" type="text" placeholder="Заметка (необязательно)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        <button type="button" className="quests__btn quests__btn--primary" disabled={busy || !amount.trim()} onClick={() => void submit()}>
          {busy ? "…" : "Добавить"}
        </button>
      </section>

      <section aria-labelledby="fin-list">
        <h2 id="fin-list" className="quests__section-title">
          Последние операции
        </h2>
        {loading ? <p className="quests__muted">Загрузка…</p> : null}
        {!loading && txs.length === 0 ? <p className="quests__muted">Пока пусто.</p> : null}
        {!loading && txs.length > 0 ? (
          <ul className="finance__txlist">
            {txs.map((t) => (
              <li key={t.id} className="finance__tx">
                <div>
                  <span className="finance__tx-title">{t.category}</span>
                  {t.note ? <span className="finance__tx-note">{t.note}</span> : null}
                  <span className="quests__card-meta">{new Date(t.occurredAt).toLocaleString("ru-RU")}</span>
                </div>
                <div className="finance__tx-right">
                  <span className={t.type === "income" ? "finance__stat-val--plus" : "finance__stat-val--minus"}>
                    {t.type === "expense" ? "−" : "+"}
                    {formatMinor(t.amountMinor)} ₽
                  </span>
                  <button type="button" className="quests__btn quests__btn--ghost" disabled={busy} onClick={() => void onDelete(t.id)}>
                    Удалить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
