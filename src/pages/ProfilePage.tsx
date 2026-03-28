import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../config/api";
import { useSession } from "../context/SessionContext";

function readDashboardHints(settings: Record<string, unknown> | null): boolean {
  if (!settings || typeof settings.dashboardHints !== "boolean") return true;
  return settings.dashboardHints;
}

export function ProfilePage() {
  const { user, loading, refresh } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [dashboardHints, setDashboardHints] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName ?? "");
    setDashboardHints(readDashboardHints(user.settings));
  }, [user]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const r = await fetch(apiUrl("/api/v1/me"), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim() || null,
          settings: { dashboardHints },
        }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setError(j.error === "display_name_too_long" ? "Имя не длиннее 120 символов." : "Не удалось сохранить.");
        return;
      }
      setMessage("Сохранено.");
      await refresh();
    } catch {
      setError("Сеть или сервер недоступны.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="profile">
        <p className="profile__muted">Загрузка…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="profile">
        <Link to="/login" className="profile__back">
          ← Войти, чтобы открыть профиль
        </Link>
      </div>
    );
  }

  return (
    <div className="profile">
      <header className="profile__header">
        <Link to="/" className="profile__back">
          ← Центр
        </Link>
        <h1 className="profile__title">Профиль</h1>
        <p className="profile__lead">Имя и настройки интерфейса хранятся в вашем аккаунте.</p>
      </header>

      <label className="profile__field">
        <span className="profile__label">Почта</span>
        <input className="profile__input profile__input--readonly" type="text" readOnly value={user.email ?? "—"} />
      </label>

      <label className="profile__field">
        <span className="profile__label">Как к вам обращаться</span>
        <input
          className="profile__input"
          type="text"
          maxLength={120}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Имя или ник"
          autoComplete="nickname"
        />
      </label>

      <label className="profile__check">
        <input type="checkbox" checked={dashboardHints} onChange={(e) => setDashboardHints(e.target.checked)} />
        <span>Подсказки на главном экране (можно отключить позже в дашборде v1)</span>
      </label>

      {error ? (
        <p className="profile__error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="profile__ok">{message}</p> : null}

      <button type="button" className="profile__save" disabled={saving} onClick={() => void save()}>
        {saving ? "Сохранение…" : "Сохранить"}
      </button>
    </div>
  );
}
