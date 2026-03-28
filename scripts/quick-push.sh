#!/usr/bin/env bash
# Git Bash: bash scripts/quick-push.sh
# Сообщение коммита по умолчанию — дата и время; опционально: bash scripts/quick-push.sh "суффикс"

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STAMP=$(date '+%Y-%m-%d %H:%M:%S')
if [ -n "${1:-}" ]; then
  MSG="$STAMP $1"
else
  MSG="$STAMP"
fi

git add -A
git status
git commit -m "$MSG" || { echo "Нечего коммитить или ошибка commit — выход."; exit 1; }
git push origin "$(git rev-parse --abbrev-ref HEAD)"

echo "OK: отправлено в origin."
