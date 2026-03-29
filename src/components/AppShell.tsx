import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { ShellTabContext } from "../context/ShellTabContext";
import { useAuth } from "../auth/AuthContext";
import { useI18n } from "../i18n/I18nContext";
import HubScreen from "../screens/HubScreen";
import FinanceScreen from "../screens/FinanceScreen";
import BodyScreen from "../screens/BodyScreen";
import TodoScreen from "../screens/TodoScreen";
import ActionsScreen from "../screens/ActionsScreen";
import { ShellNavIcon, type ShellNavId } from "./AppNavIcons";

export default function AppShell() {
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const tabs = useMemo(
    () =>
      [
        {
          id: "hub",
          navIcon: "hub" as ShellNavId,
          label: t("shell.tabHub"),
          Screen: HubScreen,
        },
        {
          id: "finance",
          navIcon: "finance",
          label: t("shell.tabFinance"),
          Screen: FinanceScreen,
        },
        {
          id: "body",
          navIcon: "body",
          label: t("shell.tabBody"),
          Screen: BodyScreen,
        },
        {
          id: "todo",
          navIcon: "todo",
          label: t("shell.tabTodo"),
          Screen: TodoScreen,
        },
        {
          id: "actions",
          navIcon: "actions",
          label: t("shell.tabActions"),
          Screen: ActionsScreen,
        },
      ] as const,
    [t],
  );

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
    <ShellTabContext.Provider value={{ activeIndex: active, goToTab: scrollToIndex }}>
      <div className="shell">
      <header className="shell__bar">
        <span className="shell__bar-email" title={user?.email}>
          {user?.email}
        </span>
        <div className="shell__bar-actions">
          <div
            className="shell__lang"
            role="group"
            aria-label={t("shell.langPick")}
          >
            <button
              type="button"
              className={`shell__lang-btn${locale === "ru" ? " shell__lang-btn--on" : ""}`}
              onClick={() => setLocale("ru")}
              aria-pressed={locale === "ru"}
            >
              {t("shell.langRu")}
            </button>
            <button
              type="button"
              className={`shell__lang-btn${locale === "en" ? " shell__lang-btn--on" : ""}`}
              onClick={() => setLocale("en")}
              aria-pressed={locale === "en"}
            >
              {t("shell.langEn")}
            </button>
          </div>
        <button
          type="button"
          className="shell__bar-logout"
          onClick={() => void logout()}
        >
          {t("shell.logout")}
        </button>
        </div>
      </header>
      <div className="shell__carousel" ref={trackRef}>
        {tabs.map(({ id, Screen }) => (
          <section
            key={id}
            className={
              id === "finance"
                ? "shell__slide shell__slide--finance"
                : id === "body"
                  ? "shell__slide shell__slide--body"
                  : id === "todo"
                    ? "shell__slide shell__slide--todo"
                    : "shell__slide"
            }
            aria-label={id}
            id={`panel-${id}`}
          >
            <Screen />
          </section>
        ))}
      </div>

      <nav className="shell__nav" aria-label={t("shell.navMain")}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            className={`shell__nav-btn${active === index ? " shell__nav-btn--active" : ""}`}
            onClick={() => scrollToIndex(index)}
            aria-current={active === index ? "page" : undefined}
          >
            <span className="shell__nav-ic">
              <ShellNavIcon id={tab.navIcon} />
            </span>
            <span className="shell__nav-tx">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
    </ShellTabContext.Provider>
  );
}
