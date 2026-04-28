#!/usr/bin/env bash
# runInDev.sh — Kill stale embedded Postgres and start pnpm dev (Windows/Git Bash)
#
# Usage:
#   bash runInDev.sh        # kill stale postgres, then start pnpm dev
#   bash runInDev.sh --dry  # preview what would be killed, don't start dev

set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry" || "${1:-}" == "--dry-run" || "${1:-}" == "-n" ]]; then
  DRY_RUN=true
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Resolve embedded Postgres port from Paperclip config ---

PAPERCLIP_HOME_DIR="${PAPERCLIP_HOME:-$HOME/.paperclip}"
INSTANCE_ID="${PAPERCLIP_INSTANCE_ID:-default}"
CONFIG_PATH="$PAPERCLIP_HOME_DIR/instances/$INSTANCE_ID/config.json"

PORT=54329  # default from runtime-config.ts

if [[ -f "$CONFIG_PATH" ]]; then
  # Extract embeddedPostgresPort or legacy pglitePort via basic grep/sed (no jq required)
  PARSED_PORT=$(grep -Eo '"embeddedPostgresPort"\s*:\s*[0-9]+' "$CONFIG_PATH" | grep -Eo '[0-9]+$' || true)
  if [[ -z "$PARSED_PORT" ]]; then
    PARSED_PORT=$(grep -Eo '"pglitePort"\s*:\s*[0-9]+' "$CONFIG_PATH" | grep -Eo '[0-9]+$' || true)
  fi
  if [[ -n "$PARSED_PORT" && "$PARSED_PORT" -gt 0 ]]; then
    PORT="$PARSED_PORT"
  fi
fi

echo "Embedded Postgres port: $PORT"

# --- Find and kill processes using that port (Windows netstat) ---

killed_any=false

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  # netstat -ano output: Proto  Local  Foreign  State  PID
  pid=$(echo "$line" | awk '{print $NF}')
  [[ "$pid" =~ ^[0-9]+$ ]] || continue
  (( pid > 0 )) || continue

  proc_name=$(powershell -NoProfile -Command "try { (Get-Process -Id $pid -ErrorAction Stop).Name } catch { '' }" 2>/dev/null || true)
  echo "Found process on port $PORT: PID $pid ($proc_name)"

  if [[ "$DRY_RUN" == false ]]; then
    powershell -NoProfile -Command "Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue" 2>/dev/null || true
    echo "  Killed PID $pid"
  fi
  killed_any=true
done < <(netstat -ano 2>/dev/null | grep ":${PORT}[[:space:]]" || true)

if [[ "$killed_any" == false ]]; then
  echo "No stale Postgres processes found."
fi

if [[ "$DRY_RUN" == true ]]; then
  echo "Dry run — re-run without --dry to kill and start dev."
  exit 0
fi

# Brief pause to let the OS release the shared memory segment
sleep 1

# --- Start pnpm dev ---

echo ""
echo "Starting pnpm dev..."
cd "$REPO_ROOT"
pnpm dev
