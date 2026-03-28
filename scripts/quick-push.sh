#!/usr/bin/env bash
# Совместимость: то же, что scripts/push.sh
DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$DIR/push.sh" "$@"
