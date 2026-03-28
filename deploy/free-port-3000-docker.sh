#!/usr/bin/env bash
# Скопируй на сервер или выполни из репозитория: bash deploy/free-port-3000-docker.sh
# Останавливает Docker-контейнеры, у которых на хосте открыт порт 3000 (IPv4 или IPv6).

set -euo pipefail

found=""
for c in $(docker ps -q); do
  out="$(docker port "$c" 2>/dev/null || true)"
  if echo "$out" | grep -qE '0\.0\.0\.0:3000|\[::\]:3000'; then
    echo "Останавливаю контейнер $c (на хосте занят порт 3000)"
    docker stop "$c"
    found=1
  fi
done

if [[ -z "$found" ]]; then
  echo "Ни один запущенный контейнер не публикует 3000 на хост. Проверка:"
else
  echo "Готово. Проверка:"
fi

ss -tlnp | grep ':3000' || echo "Порт 3000 на хосте свободен."
