import { Link, Outlet } from "react-router-dom";
import { APP_VERSION } from "../version";
import { useSession } from "../context/SessionContext";
import { MainNav } from "./MainNav";

export function AppLayout() {
  const { user, loading, logout } = useSession();

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <span className="app-topbar__title">Real Hero</span>
        <div className="app-topbar__right">
          {!loading && user ? (
            <span className="app-topbar__user">
              <span className="app-topbar__user-name">{user.displayName ?? user.email ?? "Игрок"}</span>
              <Link to="/profile" className="app-topbar__profile">
                Профиль
              </Link>
              <button type="button" className="app-topbar__logout" onClick={() => void logout()}>
                Выйти
              </button>
            </span>
          ) : !loading ? (
            <Link to="/login" className="app-topbar__login">
              Войти
            </Link>
          ) : null}
          <span className="app-topbar__ver" title={`Версия ${APP_VERSION}`}>
            v{APP_VERSION}
          </span>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <MainNav />
    </div>
  );
}
