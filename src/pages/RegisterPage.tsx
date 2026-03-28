import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function RegisterPage() {
  const { user, loading, register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await register(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка регистрации");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-card__title">Регистрация</h1>
        <p className="auth-card__hint">
          Уже есть аккаунт? <Link to="/login">Вход</Link>
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
          <p className="auth-form__note">Пароль не короче 8 символов.</p>
          <label className="auth-form__label">
            Пароль
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
            {pending ? "Создаём…" : "Зарегистрироваться"}
          </button>
        </form>
      </div>
    </div>
  );
}
