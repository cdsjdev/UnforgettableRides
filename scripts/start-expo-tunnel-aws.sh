#!/usr/bin/env bash
set -euo pipefail

# Start Expo tunnel for rides-app with consistent env vars:
# - EXPO_PUBLIC_API_URL
# - EXPO_PUBLIC_BUILD_DATE
# - EXPO_PUBLIC_GIT_SHA
#
# Usage:
#   ./scripts/start-expo-tunnel-aws.sh --ip 34.223.228.177
#   ./scripts/start-expo-tunnel-aws.sh --ip 34.223.228.177 --background
#   ./scripts/start-expo-tunnel-aws.sh --ip 34.223.228.177 --port 8083 --api-port 8082 --background

AWS_IP=""
PORT="8083"
API_PORT="8082"
BACKGROUND="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ip)
      AWS_IP="${2:-}"
      shift 2
      ;;
    --port)
      PORT="${2:-8083}"
      shift 2
      ;;
    --api-port)
      API_PORT="${2:-8082}"
      shift 2
      ;;
    --background)
      BACKGROUND="1"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$AWS_IP" ]]; then
  echo "Missing required argument: --ip <AWS_PUBLIC_IP>" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/rides-app"

if [[ ! -d "$APP_DIR" ]]; then
  echo "rides-app directory not found at: $APP_DIR" >&2
  exit 1
fi

cd "$ROOT_DIR"
BUILD_DATE="$(date +%F)"
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

export EXPO_PUBLIC_API_URL="http://${AWS_IP}:${API_PORT}/api/v1"
export EXPO_PUBLIC_BUILD_DATE="$BUILD_DATE"
export EXPO_PUBLIC_GIT_SHA="$GIT_SHA"

echo "Starting Expo tunnel with:"
echo "  EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL"
echo "  EXPO_PUBLIC_BUILD_DATE=$EXPO_PUBLIC_BUILD_DATE"
echo "  EXPO_PUBLIC_GIT_SHA=$EXPO_PUBLIC_GIT_SHA"
echo "  PORT=$PORT"

if command -v curl >/dev/null 2>&1; then
  if ! curl -fsS --max-time 8 "$EXPO_PUBLIC_API_URL/health" >/dev/null; then
    echo "Warning: API health check failed at $EXPO_PUBLIC_API_URL/health" >&2
    echo "Expo Go may open, but app API calls will fail until that URL is reachable." >&2
  fi
fi

pkill -f "expo start --tunnel" || true
pkill -f ngrok || true

cd "$APP_DIR"

if [[ "$BACKGROUND" == "1" ]]; then
  setsid nohup npx expo start --tunnel --port "$PORT" --clear > expo-tunnel.log 2>&1 < /dev/null &
  disown
  echo "Expo tunnel started in background."
  echo "Log: $APP_DIR/expo-tunnel.log"
  tail -n 60 expo-tunnel.log || true
else
  npx expo start --tunnel --port "$PORT" --clear
fi
