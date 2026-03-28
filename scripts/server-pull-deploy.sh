#!/usr/bin/env bash
# Совместимость: то же, что scripts/server-update.sh
DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$DIR/server-update.sh"
