# Real Hero

Чистый фронтенд (**Vite + React + TypeScript**). API и мобильные клиенты можно добавить позже отдельными каталогами или репозиториями.

## Локально

```bash
npm install
npm run dev
```

Сборка: `npm run build`, предпросмотр: `npm run preview`.

## Деплой на сервер

После `git push` на VPS в каталоге клона:

```bash
git pull origin master
./scripts/deploy-server.sh
```

Статика по умолчанию: `/PROGS/RH/www` (см. `scripts/deploy-server.sh`). Nginx должен отдавать этот каталог как `root`.

## Быстрый push (Git Bash)

```bash
bash scripts/quick-push.sh
```

Сообщение коммита — дата и время; опционально суффикс: `bash scripts/quick-push.sh "wip"`.
