import { useEffect, useState } from "react";
import { fetchDashboardSnapshot, type DashboardSnapshot } from "../api/mock";
import { useDashboardHomeSwipe } from "../hooks/useSwipeNavigate";

export function DashboardPage() {
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const swipe = useDashboardHomeSwipe(true);

  useEffect(() => {
    let cancelled = false;
    fetchDashboardSnapshot()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить сводку (mock).");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const expPct =
    data && data.expToNext > 0
      ? Math.min(100, Math.round((100 * data.expCurrent) / data.expToNext))
      : 0;

  return (
    <div
      className="dashboard dashboard--swipe"
      {...swipe}
      role="application"
      aria-label="Главный экран Real Hero. Свайп влево — финансы, вправо — здоровье, вверх — канбан, вниз — квесты."
    >
      <header className="dashboard__brand">
        <span className="dashboard__logo">Real Hero</span>
        <span className="dashboard__ver">0.1</span>
      </header>

      {error ? <p className="dashboard__error">{error}</p> : null}

      {!data && !error ? (
        <p className="dashboard__loading">Загрузка сводки…</p>
      ) : null}

      {data ? (
        <>
          <section className="dashboard__hero">
            <h1 className="dashboard__greeting">{data.greeting}</h1>
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

          <aside className="dashboard__compass" aria-hidden="true">
            <span className="dashboard__compass-item dashboard__compass-item--left">← Финансы</span>
            <span className="dashboard__compass-item dashboard__compass-item--right">Здоровье →</span>
            <span className="dashboard__compass-item dashboard__compass-item--up">Канбан ↑</span>
            <span className="dashboard__compass-item dashboard__compass-item--down">↓ Квесты</span>
          </aside>
        </>
      ) : null}
    </div>
  );
}
