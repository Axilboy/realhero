# Временный бесплатный HTTPS для теста (Telegram Mini App)

Нужен **https://** URL. Ниже два способа без покупки домена.

## Вариант A — Cloudflare Quick Tunnel (с вашего VPS)

Подходит, если **nginx уже слушает порт 80** и отдаёт `/PROGS/RH/www`.

На сервере (Ubuntu, root):

```bash
curl -L --output /tmp/cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
dpkg -i /tmp/cloudflared.deb
```

Запуск (выдаст URL вида `https://xxxx.trycloudflare.com`):

```bash
cloudflared tunnel --url http://127.0.0.1:80
```

- Окно терминала должно оставаться открытым (или используйте `tmux` / `screen`).
- При каждом **новом** запуске Quick Tunnel адрес обычно **другой**.
- Этот URL вставьте в **@BotFather** → ваш бот → настройки **Web App / Menu Button**.

Если nginx на другом порту — замените `80` (например `8080`).

---

## Вариант B — Vercel / Netlify (без туннеля на VPS)

1. Зайти на [vercel.com](https://vercel.com) или [netlify.com](https://netlify.com), войти через GitHub.
2. **Import** репозитория `Axilboy/realhero`.
3. Настройки сборки:
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
   - **Install:** `npm ci` или оставить по умолчанию.
4. После деплоя получите адрес вида `https://realhero-xxx.vercel.app` — его указать в BotFather.

Сайт крутится у хостера, не на вашем сервере; для временного теста в Telegram это самый простой путь.

---

## Важно для Telegram

- Только **HTTPS** (не `http://`).
- Если мини‑приложение не открывается, проверьте URL в обычном браузере сначала.
