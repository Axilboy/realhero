import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { useAuth } from "../auth/AuthContext";
import HubScreen from "../screens/HubScreen";
import FinanceScreen from "../screens/FinanceScreen";
import BodyScreen from "../screens/BodyScreen";
import TodoScreen from "../screens/TodoScreen";
import ActionsScreen from "../screens/ActionsScreen";

const TABS: { id: string; label: string; Screen: ComponentType }[] = [
  { id: "hub", label: "Герой", Screen: HubScreen },
  { id: "finance", label: "Финансы", Screen: FinanceScreen },
  { id: "body", label: "Тело", Screen: BodyScreen },
  { id: "todo", label: "Задачи", Screen: TodoScreen },
  { id: "actions", label: "Действия", Screen: ActionsScreen },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const scrollToIndex = useCallback((index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const w = track.clientWidth;
    track.scrollTo({ left: index * w, behavior: "smooth" });
    setActive(index);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const onScroll = () => {
      const w = track.clientWidth;
      if (w <= 0) return;
      const i = Math.round(track.scrollLeft / w);
      setActive((prev) => (i !== prev ? i : prev));
    };

    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="shell">
      <header className="shell__bar">
        <span className="shell__bar-email" title={user?.email}>
          {user?.email}
        </span>
        <button
          type="button"
          className="shell__bar-logout"
          onClick={() => void logout()}
        >
          Выйти
        </button>
      </header>
      <div className="shell__carousel" ref={trackRef}>
        {TABS.map(({ id, Screen }) => (
          <section
            key={id}
            className={
              id === "finance"
                ? "shell__slide shell__slide--finance"
                : "shell__slide"
            }
            aria-label={id}
            id={`panel-${id}`}
          >
            <Screen />
          </section>
        ))}
      </div>

      <nav className="shell__nav" aria-label="Основные разделы">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            className={`shell__nav-btn${active === index ? " shell__nav-btn--active" : ""}`}
            onClick={() => scrollToIndex(index)}
            aria-current={active === index ? "page" : undefined}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
