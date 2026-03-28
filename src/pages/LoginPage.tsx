import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiUrl } from "../config/api";
import { useSession } from "../context/SessionContext";

const ERRORS: Record<string, string> = {
  google_not_configured: "Вход через Google на сервере не настроен.",
  google_denied: "Google: доступ отклонён.",
  google_bad_request: "Ошибка запроса к Google.",
  google_state: "Сессия OAuth устарела. Попробуйте снова.",
  google_failed: "Не удалось завершить вход через Google.",
  yandex_not_configured: "Вход через Яндекс не настроен.",
  yandex_denied: "Яндекс: доступ отклонён.",
  yandex_bad_request: "Ошибка запроса к Яндексу.",
  yandex_state: "Сессия OAuth устарела. Попробуйте снова.",
  yandex_failed: "Не удалось завершить вход через Яндекс.",
  vk_not_configured: "Вход через VK не настроен.",
  vk_denied: "VK: доступ отклонён.",
  vk_bad_request: "Ошибка запроса к VK.",
  vk_state: "Сессия OAuth устарела. Попробуйте снова.",
  vk_failed: "Не удалось завершить вход через VK.",
};

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const err = params.get("error");
  const { user, loading } = useSession();

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [loading, user, navigate]);

  const startOAuth = (path: string) => {
    window.location.href = apiUrl(path);
  };

  return (
    <div className="login">
      <header className="login__header">
        <Link to="/" className="login__back">
          ← На главную
        </Link>
        <h1 className="login__title">Вход</h1>
        <p className="login__lead">
          Без пароля: через аккаунт Google, Яндекс или VK. Почта подтянется из аккаунта провайдера.
        </p>
      </header>

      {err ? (
        <p className="login__error" role="alert">
          {ERRORS[err] ?? `Ошибка: ${err}`}
        </p>
      ) : null}

      <div className="login__buttons">
        <button type="button" className="login__btn login__btn--google" onClick={() => startOAuth("/api/v1/auth/google")}>
          Войти через Google
        </button>
        <button type="button" className="login__btn login__btn--yandex" onClick={() => startOAuth("/api/v1/auth/yandex")}>
          Войти через Яндекс
        </button>
        <button type="button" className="login__btn login__btn--vk" onClick={() => startOAuth("/api/v1/auth/vk")}>
          Войти через VK
        </button>
      </div>

      <p className="login__note">
        Вход через Apple возможен отдельно: нужен Apple Developer и ключ .p8 — см. <code>api/README.md</code>.
      </p>
    </div>
  );
}
