import { getMotivationFromMonthlyMinor } from "../../lib/financeMotivationCards";

type Props = {
  monthlyPassiveMinor: number;
};

export default function FinanceMotivationStrip({ monthlyPassiveMinor }: Props) {
  const pack = getMotivationFromMonthlyMinor(monthlyPassiveMinor);
  if (!pack) return null;

  return (
    <section
      className="finance-motivation"
      aria-label="Что даёт пассивный поток"
    >
      <h3 className="finance__h3 finance-motivation__title">
        На что тянет пассивный доход
      </h3>
      <p className="finance-motivation__hint">
        Оценка по %% и бумагам, разложена по дню (~÷30), неделе (~×7/30) и месяцу.
        Ступени: {pack.dayBucketRub} ₽/день · {pack.weekBucketRub} ₽/нед ·{" "}
        {pack.monthBucketRub} ₽/мес
      </p>

      <div className="finance-motivation__block">
        <h4 className="finance-motivation__sub">Каждый день</h4>
        <ul className="finance-motivation__cards">
          {pack.day.map((text, i) => (
            <li key={i} className="finance-motivation__card">
              {text}
            </li>
          ))}
        </ul>
      </div>

      <div className="finance-motivation__block">
        <h4 className="finance-motivation__sub">Каждую неделю</h4>
        <ul className="finance-motivation__cards">
          {pack.week.map((text, i) => (
            <li key={i} className="finance-motivation__card">
              {text}
            </li>
          ))}
        </ul>
      </div>

      <div className="finance-motivation__block">
        <h4 className="finance-motivation__sub">Каждый месяц</h4>
        <ul className="finance-motivation__cards">
          {pack.month.map((text, i) => (
            <li key={i} className="finance-motivation__card">
              {text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
