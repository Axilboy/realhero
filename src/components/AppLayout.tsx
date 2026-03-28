import { Outlet } from "react-router-dom";
import { APP_VERSION } from "../version";
import { MainNav } from "./MainNav";

export function AppLayout() {
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <span className="app-topbar__title">Real Hero</span>
        <span className="app-topbar__ver" title={`Версия ${APP_VERSION}`}>
          v{APP_VERSION}
        </span>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <MainNav />
    </div>
  );
}
