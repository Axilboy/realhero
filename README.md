# Real Hero — веб-клиент

Версия веб-клиента: **`package.json` → `version`** (сейчас **0.4.0**, SemVer). История: `CHANGELOG.md` и экран `/changelog`.

**Бэкенд (общий для веба, Telegram и будущих приложений):** каталог **`api/`** — см. `api/README.md` и **`docs/ARCHITECTURE.md`**.

## Запуск

```bash
npm install
npm run dev
```

В другом терминале поднимите API (`cd api && npm run dev`). Запросы с фронта на **`/api/...`** в **dev** и **`npm run preview`** проксируются на `http://127.0.0.1:3000` — иначе по клику «Войти через …» браузер получит SPA вместо редиректа OAuth (раньше это выглядело как мгновенный возврат на главную). На проде в **nginx** сначала проксируйте **`location /api/`** на Node, затем `try_files` для SPA. **Redirect URI** OAuth см. `api/.env.example`. Для отдельного origin API задайте **`VITE_API_URL`** (полный URL без слэша в конце).

Сборка: `npm run build`, предпросмотр: `npm run preview`.

## Быстрая заливка (ничего не переписывать, кроме текста в кавычках)

**С компьютера (Git Bash)** — одна строка, меняете только фразу в конце в кавычках:

```bash
bash "/c/Users/axilb/OneDrive/Рабочий стол/PROGS/RH/web-app/scripts/quick-push.sh" "название коммита"
```

Если папка проекта у вас в другом месте — замените длинный путь к `quick-push.sh` один раз и дальше снова меняйте только `"название коммита"`.

**На сервере** — одна строка, без правок:

```bash
bash /PROGS/RH/web-app/scripts/server-pull-deploy.sh
```

(После первого `git pull` на сервере появятся эти скрипты; если файла ещё нет — один раз сделайте обычный `cd /PROGS/RH/web-app`, `git pull`, потом пользуйтесь строкой выше.)

## Маршруты

| Путь | Экран |
|------|--------|
| `/` | Дашборд (центр) |
| `/finance` | Финансы (заглушка) |
| `/health` | Здоровье (заглушка) |
| `/quests` | Квесты (заглушка) |
| `/kanban` | Канбан (заглушка) |
| `/changelog` | История изменений |
| `/login` | Вход (Google, Яндекс, VK) |

С главного экрана: свайп **влево** — финансы, **вправо** — здоровье, **вверх** — канбан, **вниз** — квесты.

## Деплой на сервер (статика)

1. На сервере один раз создайте каталог (если ещё пусто): `/PROGS/RH/www`.
2. Настройте **SSH-ключ** с вашего ПК на сервер (вход без пароля).
3. В PowerShell из папки `web-app`:

```powershell
$env:RH_DEPLOY_TARGET = "user@ваш-сервер"
$env:RH_DEPLOY_PATH   = "/PROGS/RH/www"
.\scripts\deploy.ps1
```

Скрипт собирает `dist`, упаковывает в архив, заливает в `/tmp` и распаковывает в `$RH_DEPLOY_PATH`.

Для **nginx** используйте `try_files` для SPA **и** отдельный `location /api/` на Node (порт API) — иначе OAuth по туннелю/домену не заработает. Пример: `deploy/nginx-spa.example.conf`.

Временный бесплатный **HTTPS** для Mini App (туннель или Vercel): см. `deploy/temporary-https.md`.

Документация проекта: `../docs/`.

## Деплой на сервере (после `git clone` + push в удалённый репозиторий)

Один раз на сервере (Ubuntu): установите **Node.js 20+** (например с [nodesource](https://github.com/nodesource/distributions) или `nvm`), затем:

```bash
cd /PROGS/RH
git clone <URL_ВАШЕГО_РЕПОЗИТОРИЯ> web-app
cd web-app
chmod +x scripts/deploy-server.sh
./scripts/deploy-server.sh
```

Повторные выкладки после `git pull`:

```bash
cd /PROGS/RH/web-app && git pull && ./scripts/deploy-server.sh
```

Каталог статики по умолчанию: `/PROGS/RH/www`. Другой путь: `DEPLOY_WWW=/var/www/real-hero ./scripts/deploy-server.sh`.

### Коммит из Git Bash (Windows)

```bash
cd "/c/Users/axilb/OneDrive/Рабочий стол/PROGS/RH/web-app"
git add -A
git status
git commit -m "ваше сообщение"
git remote add origin <URL>   # один раз
git push -u origin master
```

Перед первым `push` создайте пустой репозиторий на GitHub/GitLab и подставьте его URL.
