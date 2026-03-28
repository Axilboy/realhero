#!/usr/bin/env bash
# Run ON THE SERVER inside the cloned repo (same folder as package.json).
# Requires: Node.js 20+ (or 18+), npm.
#
#   chmod +x scripts/deploy-server.sh
#   ./scripts/deploy-server.sh
#
# Optional: export DEPLOY_WWW=/PROGS/RH/www

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WWW="${DEPLOY_WWW:-/PROGS/RH/www}"

echo "==> npm ci"
npm ci

echo "==> npm run build"
npm run build

if [[ ! -f "$ROOT/dist/index.html" ]]; then
  echo "ERROR: dist/index.html missing after build" >&2
  exit 1
fi

echo "==> publish to $WWW"
mkdir -p "$WWW"

if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$ROOT/dist/" "$WWW/"
else
  find "$WWW" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  cp -a "$ROOT/dist/." "$WWW/"
fi

echo "==> done: static files in $WWW"
echo "    configure nginx root to this path (see deploy/nginx-spa.example.conf)"
