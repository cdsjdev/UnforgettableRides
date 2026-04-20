#!/usr/bin/env bash
set -euo pipefail

# Auto-selects GPU or CPU production compose based on host capability.
# Examples:
#   ./scripts/deploy-auto.sh
#   FORCE_CPU=1 ./scripts/deploy-auto.sh
#   FORCE_GPU=1 ./scripts/deploy-auto.sh
#   ./scripts/deploy-auto.sh --print-compose
#   SKIP_SMOKE=1 ./scripts/deploy-auto.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Suppress noisy compose Bake warning on hosts without buildx.
# If buildx exists, keep current COMPOSE_BAKE behavior unchanged.
if [[ "${COMPOSE_BAKE:-1}" != "0" ]]; then
  if ! docker buildx version >/dev/null 2>&1; then
    export COMPOSE_BAKE=0
    echo "[deploy-auto] buildx not installed -> COMPOSE_BAKE=0 (classic compose build)"
  fi
fi

# Always stamp build metadata from current repo state.
# Do not inherit potentially stale shell values from previous deploy sessions.
BUILD_DATE="$(date +%F)"
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
export BUILD_DATE
export GIT_SHA

COMPOSE_GPU="docker-compose.production.yml"
COMPOSE_CPU="docker-compose.production.cpu.yml"
MIN_AVAILABLE_MB="${MIN_AVAILABLE_MB:-512}"
FAST_MIN_AVAILABLE_MB="${FAST_MIN_AVAILABLE_MB:-1024}"
LOW_MEM_AUTO_CONTINUE="${LOW_MEM_AUTO_CONTINUE:-1}"
LOW_MEM_AUTO_MAX_TOTAL_MB="${LOW_MEM_AUTO_MAX_TOTAL_MB:-2048}"

resource_guard() {
  local min_required_mb="$1"
  if [[ "${LOW_MEM_OK:-0}" == "1" ]]; then
    echo "[deploy-auto] LOW_MEM_OK=1 -> skipping resource guard"
    return 0
  fi
  if [[ ! -f "/proc/meminfo" ]]; then
    return 0
  fi
  local mem_avail_mb
  local swap_free_mb
  local mem_total_mb
  mem_avail_mb=$(awk '/MemAvailable:/ { printf("%d", $2/1024) }' /proc/meminfo)
  swap_free_mb=$(awk '/SwapFree:/ { printf("%d", $2/1024) }' /proc/meminfo)
  mem_total_mb=$(awk '/MemTotal:/ { printf("%d", $2/1024) }' /proc/meminfo)
  local total_avail_mb=$((mem_avail_mb + swap_free_mb))
  echo "[deploy-auto] resources: mem_total=${mem_total_mb}MB mem_available=${mem_avail_mb}MB swap_free=${swap_free_mb}MB total=${total_avail_mb}MB"
  if (( total_avail_mb < min_required_mb )); then
    if [[ "${LOW_MEM_AUTO_CONTINUE}" == "1" ]] && (( mem_total_mb > 0 )) && (( mem_total_mb <= LOW_MEM_AUTO_MAX_TOTAL_MB )); then
      echo "[deploy-auto] WARN: low memory (${total_avail_mb}MB < ${min_required_mb}MB), but tiny host detected (mem_total=${mem_total_mb}MB <= ${LOW_MEM_AUTO_MAX_TOTAL_MB}MB)."
      echo "[deploy-auto] WARN: continuing deploy in best-effort mode. To enforce strict guard, set LOW_MEM_AUTO_CONTINUE=0."
      return 0
    fi
    echo "[deploy-auto] ERROR: available memory+swap (${total_avail_mb}MB) is below required threshold (${min_required_mb}MB)."
    echo "[deploy-auto] Tip: wait for load to drop, add swap, or temporarily bypass with LOW_MEM_OK=1."
    exit 1
  fi
}

has_gpu=false

if command -v nvidia-smi >/dev/null 2>&1; then
  if nvidia-smi -L >/dev/null 2>&1; then
    if docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q '"nvidia"'; then
      has_gpu=true
    fi
  fi
fi

if [[ "${FORCE_CPU:-0}" == "1" ]]; then
  has_gpu=false
fi

if [[ "${FORCE_GPU:-0}" == "1" ]]; then
  has_gpu=true
fi

if [[ "$has_gpu" == true ]]; then
  compose_file="$COMPOSE_GPU"
  mode="GPU"
else
  compose_file="$COMPOSE_CPU"
  mode="CPU"
fi

if [[ "${1:-}" == "--print-compose" ]]; then
  echo "$compose_file"
  exit 0
fi

printf '%s\n' "$compose_file" > .deploy-compose

echo "[deploy-auto] mode=${mode} compose=${compose_file}"
echo "[deploy-auto] build metadata: BUILD_DATE=${BUILD_DATE} GIT_SHA=${GIT_SHA}"

# Safer deploy path (default) for small Lightsail instances:
# - build sequentially to avoid CPU/memory spikes
# - keep old containers running during build
# Opt out with FAST_DEPLOY=1
if [[ "${FAST_DEPLOY:-0}" != "1" ]]; then
  echo "[deploy-auto] SAFE mode (default) -> sequential build + rolling up"
  export COMPOSE_PARALLEL_LIMIT=1
  resource_guard "$MIN_AVAILABLE_MB"
  services=("rides-api" "rides-admin" "rides-portal" "rides-app-web")
  if [[ -d "$ROOT_DIR/ml-models" ]]; then
    services=("rides-api" "ml-service" "rides-admin" "rides-portal" "rides-app-web")
  else
    echo "[deploy-auto] ml-models directory not found -> skipping ml-service"
  fi
  for svc in "${services[@]}"; do
    resource_guard "$MIN_AVAILABLE_MB"
    echo "[deploy-auto] building ${svc}..."
    if [[ "$svc" == "rides-admin" || "$svc" == "rides-portal" ]]; then
      docker compose -f "$compose_file" build --no-cache "$svc"
    else
      docker compose -f "$compose_file" build "$svc"
    fi
    echo "[deploy-auto] restarting ${svc}..."
    docker compose -f "$compose_file" up -d --no-deps "$svc"
  done
  docker compose -f "$compose_file" up -d --remove-orphans "${services[@]}"
else
  echo "[deploy-auto] FAST_DEPLOY=1 -> parallel build/up"
  resource_guard "$FAST_MIN_AVAILABLE_MB"
  services=("rides-api" "rides-admin" "rides-portal" "rides-app-web")
  if [[ -d "$ROOT_DIR/ml-models" ]]; then
    services+=("ml-service")
  else
    echo "[deploy-auto] ml-models directory not found -> skipping ml-service"
  fi

  # Force fresh web bundles even in fast mode, while keeping cached builds for other services.
  docker compose -f "$compose_file" build --no-cache rides-admin rides-portal
  for svc in "${services[@]}"; do
    if [[ "$svc" == "rides-admin" || "$svc" == "rides-portal" ]]; then
      continue
    fi
    docker compose -f "$compose_file" build "$svc"
  done
  docker compose -f "$compose_file" up -d --remove-orphans "${services[@]}" "$@"
fi

docker compose -f "$compose_file" ps

if [[ "${SKIP_SMOKE:-0}" == "1" ]]; then
  echo "[deploy-auto] SKIP_SMOKE=1 -> skipping smoke checks"
else
  if [[ ! -x "./scripts/aws-smoke-check.sh" ]]; then
    echo "[deploy-auto] making scripts/aws-smoke-check.sh executable"
    chmod +x ./scripts/aws-smoke-check.sh
  fi
  echo "[deploy-auto] running post-deploy smoke checks..."
  COMPOSE_FILE="$compose_file" ./scripts/aws-smoke-check.sh
fi
