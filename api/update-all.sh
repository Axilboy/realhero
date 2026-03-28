#!/usr/bin/env bash
# Запуск НА СЕРВЕРЕ, если ты уже в папке api/ (как у PM2).
# Делает то же, что scripts/server-update.sh из корня web-app.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/server-update.sh"
