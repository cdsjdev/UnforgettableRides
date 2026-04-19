#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# PetCare Backup Script
#
# Backs up SQLite databases and JSON data files.
# Keeps the last N backups (default 7).
#
# Usage:
#   ./scripts/backup.sh                  # local backup
#   ./scripts/backup.sh --docker         # backup from Docker volumes
#
# Restore (local — DB in src/data/):
#   ./scripts/backup.sh --restore <backup_dir>
#
# Restore (Docker — DB in /app/db/):
#   ./scripts/backup.sh --restore <backup_dir> --docker
# ============================================================

BACKUP_ROOT="${BACKUP_ROOT:-./backups}"
KEEP_LAST="${KEEP_LAST:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"

# Default paths (local dev layout)
LOCAL_DATA_DIR="./rides-api/src/data"
LOCAL_DB_DIR="./rides-api/src/data"

# ── Helpers ─────────────────────────────────────────────────
info()  { echo "[backup] $*"; }
error() { echo "[backup] ERROR: $*" >&2; exit 1; }

# ── Restore mode ────────────────────────────────────────────
if [[ "${1:-}" == "--restore" ]]; then
  RESTORE_FROM="${2:-}"
  [[ -z "$RESTORE_FROM" ]] && error "Usage: $0 --restore <backup_dir> [--docker]"
  [[ ! -d "$RESTORE_FROM" ]] && error "Backup directory not found: $RESTORE_FROM"

  DOCKER_MODE=false
  [[ "${3:-}" == "--docker" ]] && DOCKER_MODE=true

  info "Restoring from: $RESTORE_FROM (docker=$DOCKER_MODE)"

  if [[ -f "$RESTORE_FROM/analytics.db" ]]; then
    if [[ "$DOCKER_MODE" == true ]]; then
      docker cp "$RESTORE_FROM/analytics.db" rides-api:/app/db/analytics.db
    else
      cp "$RESTORE_FROM/analytics.db" "$LOCAL_DB_DIR/analytics.db"
    fi
    info "Restored analytics.db"
  fi

  for f in "$RESTORE_FROM"/json/*.json; do
    [[ -f "$f" ]] || continue
    if [[ "$DOCKER_MODE" == true ]]; then
      docker cp "$f" rides-api:/app/src/data/
    else
      cp "$f" "$LOCAL_DATA_DIR/"
    fi
    info "Restored $(basename "$f")"
  done

  info "Restore complete. Restart the API server to pick up changes."
  exit 0
fi

# ── Backup mode ─────────────────────────────────────────────
mkdir -p "$BACKUP_DIR/json"

DATA_DIR="$LOCAL_DATA_DIR"

if [[ "${1:-}" == "--docker" ]]; then
  info "Backing up from Docker volumes..."
  mkdir -p "$BACKUP_DIR/docker-data"

  # Copy JSON data files from container
  if ! docker cp rides-api:/app/src/data/. "$BACKUP_DIR/docker-data/" 2>&1; then
    error "Failed to copy data files from container. Is rides-api running?"
  fi

  # Copy DB files from the separate db volume
  if ! docker cp rides-api:/app/db/. "$BACKUP_DIR/" 2>&1; then
    error "Failed to copy database files from container. Is rides-api running?"
  fi

  DATA_DIR="$BACKUP_DIR/docker-data"
  info "Docker data copied successfully"
fi

# SQLite: use .backup command for a consistent snapshot (no partial writes)
if command -v sqlite3 &>/dev/null; then
  for db in "$DATA_DIR"/*.db; do
    [[ -f "$db" ]] || continue
    DBNAME=$(basename "$db")
    sqlite3 "$db" ".backup '${BACKUP_DIR}/${DBNAME}'"
    info "Backed up $DBNAME (sqlite3 .backup)"
  done
else
  # Fallback: plain copy (safe if API is stopped)
  for db in "$DATA_DIR"/*.db; do
    [[ -f "$db" ]] || continue
    DBNAME=$(basename "$db")
    cp "$db" "$BACKUP_DIR/$DBNAME"
    info "Backed up $DBNAME (file copy — sqlite3 not available)"
  done
fi

# Also back up DB files from separate db dir (Docker layout: /app/db/)
# In Docker mode these were already copied to BACKUP_DIR above
if [[ "${1:-}" != "--docker" ]]; then
  for db in "$LOCAL_DB_DIR"/*.db; do
    [[ -f "$db" ]] || continue
    DBNAME=$(basename "$db")
    [[ -f "$BACKUP_DIR/$DBNAME" ]] && continue  # skip if already backed up
    if command -v sqlite3 &>/dev/null; then
      sqlite3 "$db" ".backup '${BACKUP_DIR}/${DBNAME}'"
      info "Backed up $DBNAME (sqlite3 .backup)"
    else
      cp "$db" "$BACKUP_DIR/$DBNAME"
      info "Backed up $DBNAME (file copy)"
    fi
  done
fi

# JSON data files
for f in "$DATA_DIR"/*.json; do
  [[ -f "$f" ]] || continue
  cp "$f" "$BACKUP_DIR/json/"
  info "Backed up $(basename "$f")"
done

# ── Prune old backups ──────────────────────────────────────
BACKUP_COUNT=$(ls -1d "${BACKUP_ROOT}"/20* 2>/dev/null | wc -l)
if (( BACKUP_COUNT > KEEP_LAST )); then
  TO_DELETE=$((BACKUP_COUNT - KEEP_LAST))
  ls -1d "${BACKUP_ROOT}"/20* | head -n "$TO_DELETE" | while read -r old; do
    rm -rf "$old"
    info "Pruned old backup: $(basename "$old")"
  done
fi

info "Backup complete: $BACKUP_DIR"
ls -lh "$BACKUP_DIR"
