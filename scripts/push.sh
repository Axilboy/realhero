#!/usr/bin/env bash
# ПК (Git Bash): закоммитить, если есть изменения, затем отправить в origin.
#
#   bash scripts/push.sh
#   bash scripts/push.sh "короткий комментарий"
#
# Если правок нет — коммит не делается, выполняется только git push (на случай неотправленных коммитов).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STAMP=$(date '+%Y-%m-%d %H:%M:%S')
if [ -n "${1:-}" ]; then
  MSG="$STAMP · $1"
else
  MSG="$STAMP"
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

git add -A
git status

if git diff --cached --quiet; then
  echo "==> Нет изменений для коммита."
else
  echo "==> Коммит: $MSG"
  git commit -m "$MSG"
fi

echo "==> push → origin/$BRANCH"
git push origin "$BRANCH"

echo "OK: отправлено в origin ($BRANCH)."
