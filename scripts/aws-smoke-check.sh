#!/usr/bin/env bash
set -euo pipefail

# Quick post-deploy smoke check for AWS/Lightsail.
# Usage:
#   ./scripts/aws-smoke-check.sh
#   COMPOSE_FILE=docker-compose.production.cpu.yml ./scripts/aws-smoke-check.sh
#   HOST=34.211.20.239 ./scripts/aws-smoke-check.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

HOST="${HOST:-127.0.0.1}"
API_BASE="http://${HOST}/api/v1"
DASHBOARD_URL="${DASHBOARD_URL:-http://${HOST}}"
APP_WEB_URL="${APP_WEB_URL:-http://${HOST}:8081}"

if [[ -n "${COMPOSE_FILE:-}" ]]; then
  COMPOSE_FILE_PATH="$COMPOSE_FILE"
elif [[ -f ".deploy-compose" ]]; then
  COMPOSE_FILE_PATH="$(cat .deploy-compose)"
else
  COMPOSE_FILE_PATH="docker-compose.production.cpu.yml"
fi

echo "==> Smoke check using compose file: ${COMPOSE_FILE_PATH}"

if [[ ! -f "${COMPOSE_FILE_PATH}" ]]; then
  echo "ERROR: compose file not found: ${COMPOSE_FILE_PATH}"
  exit 2
fi

check_cmd() {
  local label="$1"
  shift
  echo "-> ${label}"
  "$@"
}

check_cmd "containers running" docker compose -f "${COMPOSE_FILE_PATH}" ps

services=(rides-api rides-admin rides-app-web)
if [[ -d "$ROOT_DIR/ml-models" ]]; then
  services+=(ml-service)
else
  echo "-> skipping ml-service status check (ml-models directory not found)"
fi

for svc in "${services[@]}"; do
  check_cmd "service ${svc} status" bash -lc \
    "docker compose -f '${COMPOSE_FILE_PATH}' ps '${svc}' | grep -Eq 'Up|running'"
done

check_cmd "API health" curl -fsS "${API_BASE}/health"
check_cmd "dashboard home responds" curl -fsSI "${DASHBOARD_URL}"
check_cmd "app web responds" curl -fsSI "${APP_WEB_URL}"

echo "==> Smoke check passed"
