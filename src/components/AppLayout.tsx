import { Outlet, useLocation } from "react-router-dom";
import { MainNav } from "./MainNav";

export function AppLayout() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  return (
    <div className="app-shell">
      <main className="app-main">
        <Outlet />
      </main>
      <MainNav showHint={isHome} />
    </div>
  );
}
