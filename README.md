# Real Hero — веб-клиент

Версия **0.1**: каркас UI, маршруты, свайпы с главного экрана, mock API.

## Запуск

```bash
npm install
npm run dev
```

Сборка: `npm run build`, предпросмотр: `npm run preview`.

## Маршруты

| Путь | Экран |
|------|--------|
| `/` | Дашборд (центр) |
| `/finance` | Финансы (заглушка) |
| `/health` | Здоровье (заглушка) |
| `/quests` | Квесты (заглушка) |
| `/kanban` | Канбан (заглушка) |

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

Для **nginx** используйте `try_files` для SPA — пример: `deploy/nginx-spa.example.conf`.

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
