import { useEffect, useRef, useState } from "react";
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
  /** stack — три блока друг под другом (вкладка «Инвестиции»); carousel — день/неделя/месяц свайпом (главная) */
  layout?: "stack" | "carousel";
};

const SLIDE_COUNT = 3;

export default function FinanceMotivationStrip({
  monthlyPassiveMinor,
  shuffleKey,
  layout = "stack",
}: Props) {
  const [picks, setPicks] = useState<MotivationPicks>(randomPicks);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dotIndex, setDotIndex] = useState(0);

  useEffect(() => {
    setPicks(randomPicks());
  }, [monthlyPassiveMinor, shuffleKey]);

  const pack = getMotivationFromMonthlyMinor(monthlyPassiveMinor, picks);
  if (!pack) return null;

  const sectionClass =
    layout === "carousel"
      ? "finance-motivation finance-motivation--carousel finance-motivation--main-slot"
      : "finance-motivation";

  function carouselStepPx(): number | null {
    const el = scrollRef.current;
    if (!el) return null;
    const w = el.clientWidth;
    return w > 0 ? w : null;
  }

  function goToMotivationSlide(i: number) {
    const el = scrollRef.current;
    const step = carouselStepPx();
    if (!el || step == null) return;
    const idx = Math.min(Math.max(0, i), SLIDE_COUNT - 1);
    el.scrollTo({ left: idx * step, behavior: "smooth" });
  }

  useEffect(() => {
    if (layout !== "carousel") return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    setDotIndex(0);
    const syncDot = () => {
      const step = carouselStepPx();
      if (step == null || step <= 0) return;
      const idx = Math.round(el.scrollLeft / step);
      setDotIndex(Math.min(SLIDE_COUNT - 1, Math.max(0, idx)));
    };
    el.addEventListener("scroll", syncDot, { passive: true });
    const ro = new ResizeObserver(() => syncDot());
    ro.observe(el);
    syncDot();
    return () => {
      el.removeEventListener("scroll", syncDot);
      ro.disconnect();
    };
  }, [layout, monthlyPassiveMinor, shuffleKey]);

  const hint = (
    <p className="finance-motivation__hint">
      Оценка по %% и бумагам. Примеры — что можно купить примерно на эти деньги
      (дневная сумма округлена; неделя ~×7, месяц ~×30; цены в магазинах
      ориентировочные). Сейчас: {pack.dayBucketRub} ₽/день · {pack.weekBucketRub}{" "}
      ₽/нед · {pack.monthBucketRub} ₽/мес
    </p>
  );

  if (layout === "carousel") {
    return (
      <section
        className={sectionClass}
        aria-label="Что даёт пассивный поток"
      >
        <h3 className="finance__h3 finance-motivation__title">
          На что тянет пассивный доход
        </h3>
        <div className="finance-motivation__carousel-bleed">
          <div
            ref={scrollRef}
            className="finance-motivation__scroller finance-acc-row__scroll--hide-scrollbar"
            role="list"
          >
            <div className="finance-motivation__slide" role="listitem">
              <h4 className="finance-motivation__sub">Каждый день</h4>
              <p className="finance-motivation__card finance-motivation__card--single">
                {pack.day}
              </p>
            </div>
            <div className="finance-motivation__slide" role="listitem">
              <h4 className="finance-motivation__sub">Каждую неделю</h4>
              <p className="finance-motivation__card finance-motivation__card--single">
                {pack.week}
              </p>
            </div>
            <div className="finance-motivation__slide" role="listitem">
              <h4 className="finance-motivation__sub">Каждый месяц</h4>
              <p className="finance-motivation__card finance-motivation__card--single">
                {pack.month}
              </p>
            </div>
          </div>
          <div
            className="finance-acc-row__dots"
            role="tablist"
            aria-label="Период примера"
          >
            {(["День", "Неделя", "Месяц"] as const).map((label, i) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={dotIndex === i}
                aria-label={`${label}: пример ${i + 1} из ${SLIDE_COUNT}`}
                className={
                  dotIndex === i
                    ? "finance-acc-row__dot finance-acc-row__dot--on"
                    : "finance-acc-row__dot"
                }
                onClick={() => goToMotivationSlide(i)}
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={sectionClass}
      aria-label="Что даёт пассивный поток"
    >
      <h3 className="finance__h3 finance-motivation__title">
        На что тянет пассивный доход
      </h3>
      {hint}

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
