#!/usr/bin/env bash
set -euo pipefail

# Vision Analytics field-test helper.
# Pulls summary + camera status, evaluates basic acceptance checks,
# and writes a markdown report for audit/review.
#
# Example:
#   ./scripts/vision-analytics-field-test.sh \
#     --token "$ADMIN_JWT" \
#     --base-url "http://localhost:3000/api/v1" \
#     --date "2026-03-24"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/vision-analytics-field-test.sh --token <jwt> [options]

Required:
  --token <jwt>                  Admin JWT for API auth

Options:
  --base-url <url>               API base URL (default: http://localhost:3000/api/v1)
  --date <YYYY-MM-DD>            Summary date (default: today, server local)
  --store-id <id>                Optional store_id for scoped summary
  --max-flow-gap-pct <number>    Pass threshold for tracked_vs_legacy_flow_delta_pct
                                 (default: server flow_gap_threshold_pct, fallback 20)
  --max-entry-delta <number>     Pass threshold for absolute entry delta (default: 15)
  --max-exit-delta <number>      Pass threshold for absolute exit delta (default: 15)
  --output <path>                Markdown report path (default: docs/reports/vision-analytics-field-test-<ts>.md)
  --allow-greedy-fallback        Do not fail when tracker_mode is greedy_fallback
  -h, --help                     Show this help

Security note:
  Pass JWT via environment variable (for example ADMIN_JWT) to reduce
  shell history and log exposure.

Exit codes:
  0  All checks passed
  2  One or more checks failed
  1  Usage or runtime error
EOF
}

BASE_URL="http://localhost:3000/api/v1"
DATE_VALUE="$(date +%F)"
STORE_ID=""
TOKEN=""
MAX_FLOW_GAP_PCT=""
MAX_ENTRY_DELTA="15"
MAX_EXIT_DELTA="15"
ALLOW_GREEDY_FALLBACK="0"
OUTPUT_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --date)
      DATE_VALUE="$2"
      shift 2
      ;;
    --store-id)
      STORE_ID="$2"
      shift 2
      ;;
    --token)
      TOKEN="$2"
      shift 2
      ;;
    --max-flow-gap-pct)
      MAX_FLOW_GAP_PCT="$2"
      shift 2
      ;;
    --max-entry-delta)
      MAX_ENTRY_DELTA="$2"
      shift 2
      ;;
    --max-exit-delta)
      MAX_EXIT_DELTA="$2"
      shift 2
      ;;
    --output)
      OUTPUT_PATH="$2"
      shift 2
      ;;
    --allow-greedy-fallback)
      ALLOW_GREEDY_FALLBACK="1"
      shift 1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$TOKEN" ]]; then
  echo "Error: --token is required." >&2
  usage
  exit 1
fi

if [[ -z "$OUTPUT_PATH" ]]; then
  ts="$(date +%Y%m%d-%H%M%S)"
  OUTPUT_PATH="docs/reports/vision-analytics-field-test-${ts}.md"
fi

summary_url="${BASE_URL%/}/analytics/summary?date=${DATE_VALUE}"
if [[ -n "$STORE_ID" ]]; then
  summary_url="${summary_url}&store_id=${STORE_ID}"
fi
camera_status_url="${BASE_URL%/}/ml/camera/status"

auth_header="Authorization: Bearer ${TOKEN}"

summary_json="$(curl -fsS -H "$auth_header" "$summary_url")"
camera_status_json="$(curl -fsS -H "$auth_header" "$camera_status_url")"

combined_json="$(mktemp)"
trap 'rm -f "$combined_json"' EXIT
if [[ -n "$MAX_FLOW_GAP_PCT" ]]; then
  flow_gap_threshold_json="$MAX_FLOW_GAP_PCT"
else
  flow_gap_threshold_json="null"
fi
cat > "$combined_json" <<EOF
{
  "summary_response": $summary_json,
  "camera_status_response": $camera_status_json,
  "config": {
    "date": "$DATE_VALUE",
    "store_id": "$STORE_ID",
    "max_flow_gap_pct": $flow_gap_threshold_json,
    "max_entry_delta": $MAX_ENTRY_DELTA,
    "max_exit_delta": $MAX_EXIT_DELTA,
    "allow_greedy_fallback": $ALLOW_GREEDY_FALLBACK
  }
}
EOF

mkdir -p "$(dirname "$OUTPUT_PATH")"

analysis_output="$(python3 - "$combined_json" "$OUTPUT_PATH" <<'PY'
import json
import sys
from datetime import UTC, datetime

combined_path = sys.argv[1]
output_path = sys.argv[2]

with open(combined_path, "r", encoding="utf-8") as f:
    payload = json.load(f)

summary_resp = payload.get("summary_response") or {}
camera_resp = payload.get("camera_status_response") or {}
config = payload.get("config") or {}

summary = summary_resp.get("data") or {}
camera = camera_resp.get("data") or {}

def n(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return float(default)

def i(value, default=0):
    try:
        return int(value)
    except Exception:
        return int(default)

max_flow_gap_pct_input = config.get("max_flow_gap_pct")
if max_flow_gap_pct_input is None:
    max_flow_gap_pct = n(summary.get("flow_gap_threshold_pct"), 20.0)
else:
    max_flow_gap_pct = n(max_flow_gap_pct_input, 20.0)
max_entry_delta = i(config.get("max_entry_delta"), 15)
max_exit_delta = i(config.get("max_exit_delta"), 15)
allow_greedy_fallback = str(config.get("allow_greedy_fallback", 0)) in ("1", "true", "True")

tracking_active = bool(summary.get("tracking_active"))
tracker_mode = str(camera.get("tracker_mode") or summary.get("tracker_mode") or "unknown")
entry_delta = i(summary.get("tracked_vs_legacy_entry_delta"), 0)
exit_delta = i(summary.get("tracked_vs_legacy_exit_delta"), 0)
flow_gap_pct = n(summary.get("tracked_vs_legacy_flow_delta_pct"), 0.0)
flow_gap_abs = i(summary.get("tracked_vs_legacy_flow_delta_abs"), 0)

checks = []
checks.append(("tracking_active", tracking_active, "tracking_active should be true"))
if allow_greedy_fallback:
    tracker_ok = tracker_mode in ("byte_track", "greedy_fallback")
else:
    tracker_ok = tracker_mode == "byte_track"
checks.append(("tracker_mode", tracker_ok, f"tracker_mode={tracker_mode}"))
checks.append(("flow_gap_pct", flow_gap_pct <= max_flow_gap_pct, f"{flow_gap_pct:.1f} <= {max_flow_gap_pct:.1f}"))
checks.append(("entry_delta_abs", abs(entry_delta) <= max_entry_delta, f"{abs(entry_delta)} <= {max_entry_delta}"))
checks.append(("exit_delta_abs", abs(exit_delta) <= max_exit_delta, f"{abs(exit_delta)} <= {max_exit_delta}"))

all_pass = all(c[1] for c in checks)
status = "PASS" if all_pass else "FAIL"
now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

lines = []
lines.append("# Vision Analytics Field-Test Report")
lines.append("")
lines.append(f"- Generated at (UTC): `{now}`")
lines.append(f"- Date scope: `{config.get('date')}`")
if config.get("store_id"):
    lines.append(f"- Store scope: `{config.get('store_id')}`")
lines.append(f"- Result: **{status}**")
lines.append("")
lines.append("## Snapshot")
lines.append("")
lines.append(f"- tracking_active: `{tracking_active}`")
lines.append(f"- tracker_mode: `{tracker_mode}`")
lines.append(f"- legacy_entries / tracked_entries: `{summary.get('total_entries', 0)} / {summary.get('tracked_entries', 0)}`")
lines.append(f"- legacy_exits / tracked_exits: `{summary.get('total_exits', 0)} / {summary.get('tracked_exits', 0)}`")
lines.append(f"- flow_gap_abs: `{flow_gap_abs}`")
lines.append(f"- flow_gap_pct: `{flow_gap_pct:.1f}`")
lines.append("")
lines.append("## Checks")
lines.append("")
for name, ok, note in checks:
    icon = "PASS" if ok else "FAIL"
    lines.append(f"- [{icon}] `{name}`: {note}")
lines.append("")
lines.append("## Raw JSON")
lines.append("")
lines.append("```json")
lines.append(json.dumps({
    "summary": summary,
    "camera_status": camera,
    "thresholds": {
        "max_flow_gap_pct": max_flow_gap_pct,
        "max_entry_delta": max_entry_delta,
        "max_exit_delta": max_exit_delta,
        "allow_greedy_fallback": allow_greedy_fallback,
    },
}, ensure_ascii=False, indent=2))
lines.append("```")
lines.append("")

with open(output_path, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(status)
print(output_path)
PY
)"

result_status="$(printf '%s\n' "$analysis_output" | sed -n '1p')"
report_path="$(printf '%s\n' "$analysis_output" | sed -n '2p')"

echo "[field-test] result=${result_status}"
echo "[field-test] report=${report_path}"

if [[ "$result_status" != "PASS" ]]; then
  exit 2
fi
