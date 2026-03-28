import { Link } from "react-router-dom";
import { useSwipeBackToHome, type SwipeModule } from "../hooks/useSwipeNavigate";

type Props = {
  title: string;
  subtitle: string;
  directionHint: string;
  swipeModule: SwipeModule;
};

export function ModulePlaceholder({ title, subtitle, directionHint, swipeModule }: Props) {
  const swipe = useSwipeBackToHome(swipeModule, true);

  return (
    <div className="module module--swipe" {...swipe}>
      <header className="module__header">
        <Link to="/" className="module__back">
          ← Центр
        </Link>
        <h1 className="module__title">{title}</h1>
        <p className="module__subtitle">{subtitle}</p>
      </header>
      <div className="module__stub">
        <p className="module__stub-label">Заглушка v0.1</p>
        <p className="module__stub-text">{directionHint}</p>
      </div>
    </div>
  );
}
