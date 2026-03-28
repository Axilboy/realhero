import { Link } from "react-router-dom";
import { APP_VERSION } from "../version";

type Entry = { version: string; date: string; items: string[] };

/** Синхронизируйте с package.json и CHANGELOG.md при каждом релизе. */
const ENTRIES: Entry[] = [
  {
    version: "0.7.0",
    date: "2026-03-28",
    items: [
      "Финансы и канбан: полноценные экраны и API (копейки, три колонки).",
      "Редактирование активного квеста; дашборд обновляется при возврате на вкладку.",
      "openapi.json, примеры pm2 и systemd в deploy/.",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-03-28",
    items: [
      "Дашборд с бэкенда: уровень, EXP, стрик, квесты в тексте подсказок.",
      "Квесты: CRUD через API, награды EXP и монеты, уровни 100×N EXP за уровень.",
      "Таблицы UserStats и Quest; mock сводки убран.",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-03-28",
    items: [
      "Профиль /profile: имя, настройки (подсказки дашборда), PATCH /api/v1/me.",
      "В БД у пользователя поле settings (JSON).",
      "Dev-вход с Vite: api/.env → DEV_RELAXED_AUTH=1, кнопка на странице входа.",
      "На главной — приветствие по имени из профиля, если есть сессия.",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-03-28",
    items: [
      "Вход через Google, Яндекс, VK: экран /login и OAuth через общий API.",
      "Сессия: cookie rh_session, GET /api/v1/me, выход из шапки.",
      "Прокси Vite /api → localhost:3000 для локальной разработки.",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-03-28",
    items: [
      "Инфраструктура API: папка api/ (Fastify + Prisma, SQLite в dev).",
      "Эндпоинты /health и /api/v1/meta для проверки и версионирования контракта.",
      "Документ docs/ARCHITECTURE.md: один бэкенд для веба, Telegram и нативных клиентов.",
      "Обновлён паспорт проекта (версия паспорта 0.4).",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-03-28",
    items: [
      "Верхняя панель: название и версия из package.json.",
      "Страница «История изменений» (/changelog), ссылка с главного экрана.",
      "Обратный свайп с модулей на центр (противоположное направление).",
      "Скрипты quick-push.sh и server-pull-deploy.sh; раздел в README.",
      "Документ temporary-https.md для теста в Telegram.",
      "Убраны лишние подсказки на дашборде (дубль нижней навигации).",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-03-28",
    items: [
      "Каркас UI: дашборд, маршруты, нижняя навигация.",
      "Свайпы с главного экрана: финансы, здоровье, канбан, квесты.",
      "Mock API для сводки дня.",
      "Деплой: deploy-server.sh, deploy.ps1, пример nginx для SPA.",
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
          Текущая версия приложения: <strong>v{APP_VERSION}</strong> (SemVer: major.minor.patch)
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
