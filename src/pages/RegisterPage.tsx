import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useI18n } from "../i18n/I18nContext";

export default function RegisterPage() {
  const { user, loading, register } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!loading && user) {
    return <Navigate to="/app" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await register(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      const target =
        from && from.startsWith("/app") ? from : "/app";
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.registerError"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__lang" role="group" aria-label={t("shell.langPick")}>
          <button
            type="button"
            className={`auth-lang-btn${locale === "ru" ? " auth-lang-btn--on" : ""}`}
            onClick={() => setLocale("ru")}
            aria-pressed={locale === "ru"}
          >
            {t("shell.langRu")}
          </button>
          <button
            type="button"
            className={`auth-lang-btn${locale === "en" ? " auth-lang-btn--on" : ""}`}
            onClick={() => setLocale("en")}
            aria-pressed={locale === "en"}
          >
            {t("shell.langEn")}
          </button>
        </div>
        <h1 className="auth-card__title">{t("auth.titleRegister")}</h1>
        <p className="auth-card__hint">
          {t("auth.haveAccount")}{" "}
          <Link to="/login">{t("auth.loginLink")}</Link>
          {" · "}
          <Link to="/">{t("auth.toHome")}</Link>
        </p>
        <form className="auth-form" onSubmit={onSubmit}>
          <label className="auth-form__label">
            Email
            <input
              className="auth-form__input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <p className="auth-form__note">{t("auth.passwordHint")}</p>
          <label className="auth-form__label">
            {t("auth.password")}
            <input
              className="auth-form__input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {error ? <p className="auth-form__error">{error}</p> : null}
          <button className="auth-form__submit" type="submit" disabled={pending}>
            {pending ? t("auth.creating") : t("auth.registerBtn")}
          </button>
        </form>
      </div>
    </div>
  );
}
