#!/usr/bin/env bash
set -euo pipefail

# Script pensado para rodar no servidor via cron.
# Ele chama o endpoint interno com CRON_TOKEN e grava logs.

: "${BASE_URL:?BASE_URL não definido (ex: https://seu-dominio.com)}"
: "${CRON_TOKEN:?CRON_TOKEN não definido}"

COMPANY_ID="${COMPANY_ID:-}"   # opcional (debug)
MODE="${MODE:-skip}"           # default seguro
TIMEOUT="${TIMEOUT:-60}"       # segundos

URL="${BASE_URL%/}/api/internal/jobs/customer-levels/monthly?token=${CRON_TOKEN}&mode=${MODE}"
if [ -n "${COMPANY_ID}" ]; then
  URL="${URL}&companyId=${COMPANY_ID}"
fi

curl -sS -X POST \
  --max-time "${TIMEOUT}" \
  -H "content-type: application/json" \
  "${URL}"
echo ""
