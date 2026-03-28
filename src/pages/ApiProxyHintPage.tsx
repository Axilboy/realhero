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
        Браузер запросил <code className="api-hint__code">{full}</code>, но вместо ответа сервера пришла эта страница. Часто так при{" "}
        <strong>Cloudflare Tunnel</strong> на голую статику из <code className="api-hint__code">www</code>, без прокси <code className="api-hint__code">/api</code> на Node (порт 3000). Ещё варианты:{" "}
        <code className="api-hint__code">npm run preview</code> без запущенного API или nginx с <code className="api-hint__code">try_files</code> на все пути без блока <code className="api-hint__code">location /api/</code>.
      </p>
      <p className="login__note" style={{ marginTop: 16 }}>
        На сервере: поднимите API (<code className="api-hint__code">cd api && npm run build && npm start</code> или pm2), в nginx добавьте прокси — см.{" "}
        <code className="api-hint__code">deploy/nginx-spa.example.conf</code> (блок <code className="api-hint__code">location /api/</code>). Туннель ведите на этот nginx (порт 80/443), не на каталог файлов.
      </p>
      <p className="login__note">
        Локально: <code className="api-hint__code">cd api && npm run dev</code> и <code className="api-hint__code">npm run dev</code> — прокси Vite уже настроен.
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
