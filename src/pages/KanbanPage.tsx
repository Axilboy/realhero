import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createKanbanCard, deleteKanbanCard, fetchKanbanCards, moveKanbanCard } from "../api/realHero";
import { useSession } from "../context/SessionContext";
import type { KanbanCardDto } from "../types/dashboard";
import { useSwipeBackToHome } from "../hooks/useSwipeNavigate";

const COLS: { key: KanbanCardDto["column"]; label: string }[] = [
  { key: "todo", label: "К выполнению" },
  { key: "doing", label: "В работе" },
  { key: "done", label: "Готово" },
];

export function KanbanPage() {
  const { user, loading: sessionLoading } = useSession();
  const [cards, setCards] = useState<KanbanCardDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const swipe = useSwipeBackToHome("kanban", true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchKanbanCards();
      setCards(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setCards([]);
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

  const byCol = useMemo(() => {
    const m: Record<string, KanbanCardDto[]> = { todo: [], doing: [], done: [] };
    for (const c of cards) {
      if (!m[c.column]) m[c.column] = [];
      m[c.column].push(c);
    }
    return m;
  }, [cards]);

  const addCard = async () => {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      await createKanbanCard(t, "todo");
      setTitle("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не добавилось");
    } finally {
      setBusy(false);
    }
  };

  const move = async (id: string, column: KanbanCardDto["column"]) => {
    setBusy(true);
    setError(null);
    try {
      await moveKanbanCard(id, column);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не переместилось");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Удалить карточку?")) return;
    setBusy(true);
    try {
      await deleteKanbanCard(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалилось");
    } finally {
      setBusy(false);
    }
  };

  if (sessionLoading) {
    return (
      <div className="kanban module module--swipe" {...swipe}>
        <p className="quests__muted">Загрузка…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="kanban module module--swipe" {...swipe}>
        <header className="module__header">
          <Link to="/login" className="module__back">
            ← Войти
          </Link>
          <h1 className="module__title">Канбан</h1>
          <p className="module__subtitle">Нужна сессия.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="kanban module module--swipe" {...swipe}>
      <header className="module__header">
        <Link to="/" className="module__back">
          ← Центр
        </Link>
        <h1 className="module__title">Канбан</h1>
        <p className="module__subtitle">Три колонки. Перенос — выбор колонки (drag-and-drop позже).</p>
      </header>

      {error ? (
        <p className="quests__error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="quests__new finance__form">
        <h2 className="quests__section-title">Новая карточка</h2>
        <input className="quests__input" placeholder="Заголовок задачи" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        <button type="button" className="quests__btn quests__btn--primary" disabled={busy || !title.trim()} onClick={() => void addCard()}>
          В «К выполнению»
        </button>
      </section>

      {loading ? <p className="quests__muted">Загрузка…</p> : null}

      {!loading ? (
        <div className="kanban__board">
          {COLS.map(({ key, label }) => (
            <div key={key} className="kanban__column">
              <h3 className="kanban__col-title">{label}</h3>
              <ul className="kanban__cards">
                {(byCol[key] ?? []).map((c) => (
                  <li key={c.id} className="kanban__card">
                    <p className="kanban__card-text">{c.title}</p>
                    <div className="kanban__card-actions">
                      {COLS.filter((x) => x.key !== c.column).map((x) => (
                        <button key={x.key} type="button" className="quests__btn" disabled={busy} onClick={() => void move(c.id, x.key)}>
                          → {x.label}
                        </button>
                      ))}
                      <button type="button" className="quests__btn quests__btn--ghost" disabled={busy} onClick={() => void remove(c.id)}>
                        Удалить
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
