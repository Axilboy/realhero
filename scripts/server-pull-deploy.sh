#!/usr/bin/env bash
# На СЕРВЕРЕ, из любого места — если скрипт лежит в /PROGS/RH/web-app/scripts/
# Одна команда, ничего не переписывать:
#   bash /PROGS/RH/web-app/scripts/server-pull-deploy.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

git pull
./scripts/deploy-server.sh

echo "OK: сервер обновлён, статика в /PROGS/RH/www"
