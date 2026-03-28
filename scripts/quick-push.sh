#!/usr/bin/env bash
# Запуск из Git Bash из ЛЮБОЙ папки — скрипт сам перейдёт в корень web-app.
# Меняйте только текст в кавычках в конце:
#   bash scripts/quick-push.sh "моё сообщение коммита"

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MSG="${1:-chore: update}"

git add -A
git status
git commit -m "$MSG" || { echo "Нечего коммитить или ошибка commit — выход."; exit 1; }
git push origin "$(git rev-parse --abbrev-ref HEAD)"

echo "OK: отправлено в origin."
