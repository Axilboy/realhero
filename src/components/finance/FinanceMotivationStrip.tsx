import { useEffect, useState } from "react";
import {
  getMotivationFromMonthlyMinor,
  type MotivationPicks,
} from "../../lib/financeMotivationCards";

function randomPicks(): MotivationPicks {
  return {
    day: Math.floor(Math.random() * 3),
    week: Math.floor(Math.random() * 3),
    month: Math.floor(Math.random() * 3),
  };
}

type Props = {
  monthlyPassiveMinor: number;
  /** Меняется при обновлении данных и при повторном «открытии» вкладки — новый случайный набор фраз */
  shuffleKey: number;
};

export default function FinanceMotivationStrip({
  monthlyPassiveMinor,
  shuffleKey,
}: Props) {
  const [picks, setPicks] = useState<MotivationPicks>(randomPicks);

  useEffect(() => {
    setPicks(randomPicks());
  }, [monthlyPassiveMinor, shuffleKey]);

  const pack = getMotivationFromMonthlyMinor(monthlyPassiveMinor, picks);
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
        Оценка по %% и бумагам. Ступени с шагом 5 ₽/день: день · неделя (×7) ·
        месяц (×30). Сейчас: {pack.dayBucketRub} ₽/день · {pack.weekBucketRub}{" "}
        ₽/нед · {pack.monthBucketRub} ₽/мес
      </p>

      <div className="finance-motivation__block">
        <h4 className="finance-motivation__sub">Каждый день</h4>
        <p className="finance-motivation__card finance-motivation__card--single">
          {pack.day}
        </p>
      </div>

      <div className="finance-motivation__block">
        <h4 className="finance-motivation__sub">Каждую неделю</h4>
        <p className="finance-motivation__card finance-motivation__card--single">
          {pack.week}
        </p>
      </div>

      <div className="finance-motivation__block">
        <h4 className="finance-motivation__sub">Каждый месяц</h4>
        <p className="finance-motivation__card finance-motivation__card--single">
          {pack.month}
        </p>
      </div>
    </section>
  );
}
