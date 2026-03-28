import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { completeQuest, createQuest, deleteQuest, fetchQuests } from "../api/realHero";
import { useSession } from "../context/SessionContext";
import type { QuestDto } from "../types/dashboard";
import { useSwipeBackToHome } from "../hooks/useSwipeNavigate";

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function QuestsPage() {
  const { user, loading: sessionLoading } = useSession();
  const [quests, setQuests] = useState<QuestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [rewardExp, setRewardExp] = useState("10");
  const [rewardCoins, setRewardCoins] = useState("0");
  const [busyId, setBusyId] = useState<string | null>(null);
  const swipe = useSwipeBackToHome("quests", true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchQuests();
      setQuests(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
      setQuests([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setLoading(false);
      setQuests([]);
      return;
    }
    void load();
  }, [user, sessionLoading, load]);

  const submitNew = async () => {
    const t = title.trim();
    if (!t) return;
    const exp = parseInt(rewardExp, 10);
    const coins = parseInt(rewardCoins, 10);
    setBusyId("__new__");
    setError(null);
    try {
      await createQuest({
        title: t,
        rewardExp: Number.isFinite(exp) ? exp : 10,
        rewardCoins: Number.isFinite(coins) ? coins : 0,
      });
      setTitle("");
      setRewardExp("10");
      setRewardCoins("0");
      setToast("Квест добавлен");
      setTimeout(() => setToast(null), 2500);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать");
    } finally {
      setBusyId(null);
    }
  };

  const onComplete = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const r = await completeQuest(id);
      if (r.leveledUp) {
        setToast(`Новый уровень: ${r.level}! +${r.rewardExp} EXP`);
      } else {
        setToast(`Готово: +${r.rewardExp} EXP${r.rewardCoins ? `, +${r.rewardCoins} монет` : ""}`);
      }
      setTimeout(() => setToast(null), 3200);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось завершить");
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Удалить квест?")) return;
    setBusyId(id);
    setError(null);
    try {
      await deleteQuest(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить");
    } finally {
      setBusyId(null);
    }
  };

  if (sessionLoading) {
    return (
      <div className="quests module module--swipe" {...swipe}>
        <p className="quests__muted">Загрузка…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="quests module module--swipe" {...swipe}>
        <header className="module__header">
          <Link to="/login" className="module__back">
            ← Войти
          </Link>
          <h1 className="module__title">Квесты</h1>
          <p className="module__subtitle">Нужна сессия, чтобы вести квесты.</p>
        </header>
      </div>
    );
  }

  const open = quests.filter((q) => !q.done);
  const done = quests.filter((q) => q.done);

  return (
    <div className="quests module module--swipe" {...swipe}>
      <header className="module__header">
        <Link to="/" className="module__back">
          ← Центр
        </Link>
        <h1 className="module__title">Квесты и привычки</h1>
        <p className="module__subtitle">Создай задачу, выполни — получи EXP и монеты.</p>
      </header>

      {toast ? (
        <p className="quests__toast" role="status">
          {toast}
        </p>
      ) : null}
      {error ? (
        <p className="quests__error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="quests__new" aria-labelledby="quests-new-title">
        <h2 id="quests-new-title" className="quests__section-title">
          Новый квест
        </h2>
        <input
          className="quests__input"
          type="text"
          placeholder="Название (до 200 символов)"
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="quests__row">
          <label className="quests__mini">
            EXP
            <input
              className="quests__input quests__input--num"
              type="number"
              min={1}
              max={500}
              value={rewardExp}
              onChange={(e) => setRewardExp(e.target.value)}
            />
          </label>
          <label className="quests__mini">
            Монеты
            <input
              className="quests__input quests__input--num"
              type="number"
              min={0}
              max={1000}
              value={rewardCoins}
              onChange={(e) => setRewardCoins(e.target.value)}
            />
          </label>
        </div>
        <button type="button" className="quests__btn quests__btn--primary" disabled={busyId !== null || !title.trim()} onClick={() => void submitNew()}>
          {busyId === "__new__" ? "Сохранение…" : "Добавить"}
        </button>
      </section>

      {loading ? <p className="quests__muted">Загрузка списка…</p> : null}

      {!loading ? (
        <>
          <section className="quests__list-block" aria-labelledby="quests-open-title">
            <h2 id="quests-open-title" className="quests__section-title">
              Активные ({open.length})
            </h2>
            {open.length === 0 ? (
              <p className="quests__muted">Пока пусто — добавь квест выше.</p>
            ) : (
              <ul className="quests__list">
                {open.map((q) => (
                  <li key={q.id} className="quests__card">
                    <div className="quests__card-main">
                      <span className="quests__card-title">{q.title}</span>
                      <span className="quests__card-meta">
                        +{q.rewardExp} EXP
                        {q.rewardCoins ? ` · +${q.rewardCoins} 🪙` : ""}
                      </span>
                    </div>
                    <div className="quests__card-actions">
                      <button
                        type="button"
                        className="quests__btn quests__btn--ok"
                        disabled={busyId !== null}
                        onClick={() => void onComplete(q.id)}
                      >
                        {busyId === q.id ? "…" : "Выполнено"}
                      </button>
                      <button
                        type="button"
                        className="quests__btn quests__btn--ghost"
                        disabled={busyId !== null}
                        onClick={() => void onDelete(q.id)}
                      >
                        Удалить
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="quests__list-block" aria-labelledby="quests-done-title">
            <h2 id="quests-done-title" className="quests__section-title">
              Архив ({done.length})
            </h2>
            {done.length === 0 ? (
              <p className="quests__muted">Завершённые появятся здесь.</p>
            ) : (
              <ul className="quests__list quests__list--done">
                {done.map((q) => (
                  <li key={q.id} className="quests__card quests__card--done">
                    <span className="quests__card-title">{q.title}</span>
                    <span className="quests__card-meta">
                      {q.completedAt ? formatWhen(q.completedAt) : ""} · +{q.rewardExp} EXP
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
