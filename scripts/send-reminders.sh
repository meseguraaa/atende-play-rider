#!/usr/bin/env bash

set -euo pipefail
INTERNAL_API_SECRET="uma_chave_qualquer_grande_e_unica"

APP_URL="${APP_URL:-http://127.0.0.1:3000}"
INTERNAL_API_SECRET="${INTERNAL_API_SECRET:-}"

if [ -z "$INTERNAL_API_SECRET" ]; then
  echo "INTERNAL_API_SECRET nao definido"
  exit 1
fi

curl -fsS -X POST \
  "${APP_URL}/api/whatsapp/send-reminders" \
  -H "x-internal-secret: ${INTERNAL_API_SECRET}" \
  -H "Content-Type: application/json"