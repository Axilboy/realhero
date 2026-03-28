#!/usr/bin/env bash
# СЕРВЕР (Linux): подтянуть репозиторий, собрать фронт в www, обновить API и перезапустить PM2.
# Запускать из корня клона (рядом с package.json фронта и папкой api/).
#
#   cd /PROGS/RH/web-app
#   bash scripts/server-update.sh
#
# Переменные (опционально):
#   DEPLOY_WWW=/PROGS/RH/www   — каталог статики для nginx
#   PM2_NAME=realhero-api      — имя процесса в pm2

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "========== Real Hero: обновление на сервере =========="

echo "==> git pull"
git pull

echo "==> фронтенд (npm ci, build, копирование в www)"
bash "$ROOT/scripts/deploy-server.sh"

API_ROOT="$ROOT/api"
PM2_NAME="${PM2_NAME:-realhero-api}"

if [[ ! -d "$API_ROOT" ]]; then
  echo "WARN: нет каталога api/ — API пропущен."
  echo "OK: статика обновлена."
  exit 0
fi

echo "==> API: npm ci, prisma db push, сборка"
cd "$API_ROOT"
npm ci
npx prisma db push
npm run build
cd "$ROOT"

echo "==> pm2 restart $PM2_NAME"
pm2 restart "$PM2_NAME"

echo "OK: статика + API ($PM2_NAME)."
