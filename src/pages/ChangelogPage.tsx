import { Link } from "react-router-dom";
import { APP_VERSION } from "../version";

type Entry = { version: string; date: string; items: string[] };

const ENTRIES: Entry[] = [
  {
    version: "0.1.0",
    date: "2026-03-28",
    items: [
      "Каркас UI: дашборд, маршруты, нижняя навигация.",
      "Свайпы с главного экрана: финансы, здоровье, канбан, квесты.",
      "Обратный свайп с экранов модулей на центр.",
      "Mock API для сводки дня.",
      "Скрипты деплоя и документация.",
    ],
  },
];

export function ChangelogPage() {
  return (
    <div className="changelog">
      <header className="changelog__header">
        <Link to="/" className="changelog__back">
          ← Центр
        </Link>
        <h1 className="changelog__title">История изменений</h1>
        <p className="changelog__subtitle">
          Текущая версия приложения: <strong>v{APP_VERSION}</strong>
        </p>
      </header>
      <ol className="changelog__list">
        {ENTRIES.map((e) => (
          <li key={e.version} className="changelog__entry">
            <h2 className="changelog__ver">
              v{e.version}{" "}
              <span className="changelog__date">{e.date}</span>
            </h2>
            <ul className="changelog__bullets">
              {e.items.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
