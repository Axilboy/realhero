import { NavLink } from "react-router-dom";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `main-nav__link${isActive ? " main-nav__link--active" : ""}`;

export function MainNav() {
  return (
    <nav className="main-nav" aria-label="Основные разделы">
      <div className="main-nav__row">
        <NavLink to="/" end className={linkClass}>
          Центр
        </NavLink>
        <NavLink to="/finance" className={linkClass}>
          Финансы
        </NavLink>
        <NavLink to="/health" className={linkClass}>
          Здоровье
        </NavLink>
        <NavLink to="/quests" className={linkClass}>
          Квесты
        </NavLink>
        <NavLink to="/kanban" className={linkClass}>
          Канбан
        </NavLink>
      </div>
    </nav>
  );
}
