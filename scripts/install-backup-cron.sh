#!/usr/bin/env bash
set -euo pipefail

# Install a daily Docker backup cron job for PetCare.
#
# Usage:
#   ./scripts/install-backup-cron.sh
#   BACKUP_HOUR=3 BACKUP_MINUTE=30 KEEP_LAST=7 ./scripts/install-backup-cron.sh
#
# Optional:
#   TIMEZONE=UTC ./scripts/install-backup-cron.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKUP_HOUR="${BACKUP_HOUR:-3}"
BACKUP_MINUTE="${BACKUP_MINUTE:-30}"
KEEP_LAST="${KEEP_LAST:-7}"
BACKUP_ROOT="${BACKUP_ROOT:-${ROOT_DIR}/backups}"
TIMEZONE="${TIMEZONE:-UTC}"

if ! [[ "$BACKUP_HOUR" =~ ^[0-9]+$ ]] || (( BACKUP_HOUR < 0 || BACKUP_HOUR > 23 )); then
  echo "ERROR: BACKUP_HOUR must be 0-23" >&2
  exit 2
fi
if ! [[ "$BACKUP_MINUTE" =~ ^[0-9]+$ ]] || (( BACKUP_MINUTE < 0 || BACKUP_MINUTE > 59 )); then
  echo "ERROR: BACKUP_MINUTE must be 0-59" >&2
  exit 2
fi
if ! [[ "$KEEP_LAST" =~ ^[0-9]+$ ]] || (( KEEP_LAST < 1 || KEEP_LAST > 365 )); then
  echo "ERROR: KEEP_LAST must be 1-365" >&2
  exit 2
fi

mkdir -p "$BACKUP_ROOT" "${ROOT_DIR}/logs"

if [[ ! -x "${ROOT_DIR}/scripts/backup.sh" ]]; then
  chmod +x "${ROOT_DIR}/scripts/backup.sh"
fi

JOB_TAG="# petcare-daily-backup"
JOB_CMD="cd ${ROOT_DIR} && TZ=${TIMEZONE} BACKUP_ROOT=${BACKUP_ROOT} KEEP_LAST=${KEEP_LAST} ./scripts/backup.sh --docker >> ${ROOT_DIR}/logs/backup-cron.log 2>&1"
JOB_LINE="${BACKUP_MINUTE} ${BACKUP_HOUR} * * * ${JOB_CMD} ${JOB_TAG}"

CURRENT_CRON="$(crontab -l 2>/dev/null || true)"
FILTERED_CRON="$(printf '%s\n' "${CURRENT_CRON}" | sed '/petcare-daily-backup/d')"

{
  printf '%s\n' "${FILTERED_CRON}"
  printf '%s\n' "${JOB_LINE}"
} | sed '/^[[:space:]]*$/d' | crontab -

echo "Installed daily backup cron:"
echo "  ${JOB_LINE}"
echo
echo "Current crontab:"
crontab -l

