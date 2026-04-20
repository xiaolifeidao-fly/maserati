#!/usr/bin/env bash
set -euo pipefail

APP_NAME="app-api"
PORT="8191"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/$APP_NAME.pid"

stop_pid() {
  local pid="$1"
  if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  kill "$pid"
  for _ in $(seq 1 10); do
    if ! kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done

  kill -9 "$pid" 2>/dev/null || true
}

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  stop_pid "$PID"
  rm -f "$PID_FILE"
  echo "$APP_NAME stopped by pid file, pid: $PID"
fi

if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -ti ":$PORT" || true)"
  if [ -n "$PIDS" ]; then
    for PID in $PIDS; do
      stop_pid "$PID"
    done
    echo "$APP_NAME stopped by port $PORT, pid: $PIDS"
    exit 0
  fi
fi

echo "$APP_NAME is not running"
