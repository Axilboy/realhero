import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useI18n } from "../i18n/I18nContext";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  if (!loading && user) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="landing">
      <div className="landing__inner">
        <header className="landing__header">
          <span className="landing__brand">Real Hero</span>
          <div className="landing__header-actions">
            <div
              className="landing__lang"
              role="group"
              aria-label={t("shell.langPick")}
            >
              <button
                type="button"
                className={`landing__lang-btn${locale === "ru" ? " landing__lang-btn--on" : ""}`}
                onClick={() => setLocale("ru")}
                aria-pressed={locale === "ru"}
              >
                {t("shell.langRu")}
              </button>
              <button
                type="button"
                className={`landing__lang-btn${locale === "en" ? " landing__lang-btn--on" : ""}`}
                onClick={() => setLocale("en")}
                aria-pressed={locale === "en"}
              >
                {t("shell.langEn")}
              </button>
            </div>
            <Link className="landing__link" to="/login">
              {t("landing.login")}
            </Link>
            <Link className="landing__btn landing__btn--ghost" to="/register">
              {t("landing.register")}
            </Link>
          </div>
        </header>

        <main className="landing__main">
          {from?.startsWith("/app") ? (
            <p className="landing__banner" role="status">
              {t("landing.banner")}
            </p>
          ) : null}

          <h1 className="landing__title">{t("landing.title")}</h1>
          <p className="landing__lead">{t("landing.lead")}</p>

          <div className="landing__cta">
            <Link className="landing__btn landing__btn--primary" to="/register">
              {t("landing.ctaRegister")}
            </Link>
            <Link className="landing__btn landing__btn--secondary" to="/login">
              {t("landing.ctaLogin")}
            </Link>
          </div>

          <ul className="landing__features">
            <li className="landing__feature">
              <span className="landing__feature-title">
                {t("landing.featFinance")}
              </span>
              <span className="landing__feature-text">
                {t("landing.featFinanceText")}
              </span>
            </li>
            <li className="landing__feature">
              <span className="landing__feature-title">
                {t("landing.featBody")}
              </span>
              <span className="landing__feature-text">
                {t("landing.featBodyText")}
              </span>
            </li>
            <li className="landing__feature">
              <span className="landing__feature-title">
                {t("landing.featHero")}
              </span>
              <span className="landing__feature-text">
                {t("landing.featHeroText")}
              </span>
            </li>
          </ul>
        </main>

        <footer className="landing__footer">
          <p className="landing__footer-note">{t("landing.footerNote")}</p>
        </footer>
      </div>
    </div>
  );
}
