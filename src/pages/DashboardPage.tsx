import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDashboard } from "../api/realHero";
import { useSession } from "../context/SessionContext";
import type { DashboardSnapshot } from "../types/dashboard";
import { useDashboardHomeSwipe } from "../hooks/useSwipeNavigate";

export function DashboardPage() {
  const { user, loading: sessionLoading } = useSession();
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const swipe = useDashboardHomeSwipe(true);

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    try {
      const d = await fetchDashboard();
      setData(d);
      setError(null);
      setNeedLogin(false);
    } catch (e) {
      if (e instanceof Error && e.message === "unauthorized") {
        setNeedLogin(true);
        setData(null);
      } else {
        setError("Не удалось загрузить сводку. Проверь API и сеть.");
        setData(null);
      }
    }
  }, [user]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setNeedLogin(true);
      setData(null);
      setError(null);
      return;
    }
    setNeedLogin(false);
    void loadDashboard();
  }, [user, sessionLoading, loadDashboard]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && user) void loadDashboard();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [user, loadDashboard]);

  const expPct =
    data && data.expToNext > 0
      ? Math.min(100, Math.round((100 * data.expCurrent) / data.expToNext))
      : 0;

  if (sessionLoading) {
    return (
      <div className="dashboard dashboard--swipe" {...swipe}>
        <p className="dashboard__loading">Загрузка…</p>
      </div>
    );
  }

  if (needLogin) {
    return (
      <div className="dashboard dashboard--swipe" {...swipe}>
        <div className="dashboard__guest">
          <p className="dashboard__guest-text">Войдите, чтобы видеть прогресс, квесты и стрик.</p>
          <Link to="/login" className="dashboard__guest-link">
            Перейти ко входу
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="dashboard dashboard--swipe"
      {...swipe}
      role="application"
      aria-label="Главный экран Real Hero. Свайп влево — финансы, вправо — здоровье, вверх — канбан, вниз — квесты."
    >
      <div className="dashboard__links">
        <Link to="/changelog" className="dashboard__changelog-link">
          История изменений
        </Link>
      </div>

      {error ? <p className="dashboard__error">{error}</p> : null}

      {!data && !error ? (
        <p className="dashboard__loading">Загрузка сводки…</p>
      ) : null}

      {data ? (
        <>
          <section className="dashboard__hero">
            <h1 className="dashboard__greeting">
              {user?.displayName?.trim()
                ? `Привет, ${user.displayName.trim()}!`
                : data.greeting}
            </h1>
            <div className="dashboard__level">
              <span className="dashboard__level-label">Уровень {data.level}</span>
              <div className="dashboard__expbar" role="progressbar" aria-valuenow={expPct} aria-valuemin={0} aria-valuemax={100}>
                <div className="dashboard__expbar-fill" style={{ width: `${expPct}%` }} />
              </div>
              <span className="dashboard__exp-caption">
                {data.expCurrent} / {data.expToNext} EXP
              </span>
            </div>
            <p className="dashboard__streak">Серия дней: {data.streakDays}</p>
          </section>

          <section className="dashboard__section" aria-labelledby="dash-highlights">
            <h2 id="dash-highlights" className="dashboard__section-title">
              На сегодня
            </h2>
            <ul className="dashboard__list">
              {data.highlights.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </section>

          <section className="dashboard__section" aria-labelledby="dash-notes">
            <h2 id="dash-notes" className="dashboard__section-title">
              Уведомления
            </h2>
            <ul className="dashboard__notifications">
              {data.notifications.map((n) => (
                <li key={n.id} className={`dashboard__note dashboard__note--${n.tone}`}>
                  {n.text}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
