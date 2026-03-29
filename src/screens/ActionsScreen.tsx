import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";

export default function ActionsScreen() {
  const { t, locale, setLocale } = useI18n();
  const { user, logout } = useAuth();

  return (
    <div className="screen settings-screen">
      <h1 className="settings-screen__title">{t("actions.pageTitle")}</h1>
      <p className="settings-screen__intro">{t("actions.intro")}</p>

      <section className="settings-screen__block" aria-labelledby="settings-account">
        <h2 id="settings-account" className="settings-screen__section-title">
          {t("actions.sectionAccount")}
        </h2>
        <div className="settings-card">
          <div className="settings-row settings-row--static">
            <span className="settings-row__label">{t("actions.emailLabel")}</span>
            <span className="settings-row__value" title={user?.email ?? undefined}>
              {user?.email ?? "—"}
            </span>
          </div>
        </div>
      </section>

      <section className="settings-screen__block" aria-labelledby="settings-interface">
        <h2 id="settings-interface" className="settings-screen__section-title">
          {t("actions.sectionInterface")}
        </h2>
        <div className="settings-card">
          <div className="settings-row settings-row--lang">
            <span className="settings-row__label">{t("actions.langLabel")}</span>
            <div
              className="settings-screen__lang"
              role="group"
              aria-label={t("shell.langPick")}
            >
              <button
                type="button"
                className={`settings-screen__lang-btn${locale === "ru" ? " settings-screen__lang-btn--on" : ""}`}
                onClick={() => setLocale("ru")}
                aria-pressed={locale === "ru"}
              >
                {t("shell.langRu")}
              </button>
              <button
                type="button"
                className={`settings-screen__lang-btn${locale === "en" ? " settings-screen__lang-btn--on" : ""}`}
                onClick={() => setLocale("en")}
                aria-pressed={locale === "en"}
              >
                {t("shell.langEn")}
              </button>
            </div>
          </div>
          <p className="settings-screen__hint">{t("actions.langHint")}</p>
        </div>
      </section>

      <section className="settings-screen__block" aria-labelledby="settings-soon">
        <h2 id="settings-soon" className="settings-screen__section-title">
          {t("actions.sectionSoon")}
        </h2>
        <div className="settings-card">
          <button
            type="button"
            className="settings-row settings-row--soon"
            disabled
            aria-disabled="true"
          >
            <span className="settings-row__label">{t("actions.soonNotifications")}</span>
            <span className="settings-row__badge">{t("actions.soonBadge")}</span>
          </button>
          <button
            type="button"
            className="settings-row settings-row--soon"
            disabled
            aria-disabled="true"
          >
            <span className="settings-row__label">{t("actions.soonTheme")}</span>
            <span className="settings-row__badge">{t("actions.soonBadge")}</span>
          </button>
          <button
            type="button"
            className="settings-row settings-row--soon settings-row--last"
            disabled
            aria-disabled="true"
          >
            <span className="settings-row__label">{t("actions.soonExport")}</span>
            <span className="settings-row__badge">{t("actions.soonBadge")}</span>
          </button>
        </div>
      </section>

      <button
        type="button"
        className="settings-screen__logout"
        onClick={() => void logout()}
      >
        {t("actions.logout")}
      </button>
    </div>
  );
}
