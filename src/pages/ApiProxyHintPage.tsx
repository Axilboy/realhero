import { Link, useLocation } from "react-router-dom";

/**
 * Если по адресу /api/... отдали index.html (SPA), роутер оказывается здесь вместо ответа бэкенда.
 * Иначе wildcard в AppLayout перекидывал на «/» — создавалось ощущение, что кнопка входа ведёт на главную.
 */
export function ApiProxyHintPage() {
  const { pathname, search } = useLocation();
  const full = `${pathname}${search}`;

  return (
    <div className="login">
      <h1 className="login__title">API не проксируется</h1>
      <p className="login__lead">
        Браузер запросил <code className="api-hint__code">{full}</code>, но вместо ответа сервера пришла эта страница. Обычно так бывает при{" "}
        <code className="api-hint__code">npm run preview</code> без прокси или если nginx отдаёт SPA на все пути, не отдав <code className="api-hint__code">/api</code> на Node.
      </p>
      <p className="login__note" style={{ marginTop: 16 }}>
        Локально: в одном терминале <code className="api-hint__code">cd api && npm run dev</code>, в другом —{" "}
        <code className="api-hint__code">npm run dev</code> (в dev и preview в проекте настроен прокси <code className="api-hint__code">/api</code> → порт 3000).
      </p>
      <p className="login__note">
        Если фронт и API на разных доменах — задайте <code className="api-hint__code">VITE_API_URL</code> на полный URL API и пересоберите клиент.
      </p>
      <p style={{ marginTop: 20 }}>
        <Link to="/login" className="login__back">
          ← Ко входу
        </Link>
      </p>
    </div>
  );
}
