#!/bin/sh
set -eu

APP_NAME="manager-api"
PORT="8291"
START_TIMEOUT="${START_TIMEOUT:-30}"
TMUX_SESSION="${TMUX_SESSION:-maserati-$APP_NAME}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/$APP_NAME.pid"
LOG_DIR="${LOG_DIR:-$SCRIPT_DIR/logs}"
LOG_FILE="${LOG_FILE:-$LOG_DIR/$APP_NAME.log}"

cd "$SCRIPT_DIR"
mkdir -p "$LOG_DIR"

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    echo "$APP_NAME is already running, pid: $PID"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

if command -v lsof >/dev/null 2>&1; then
  PORT_PID="$(lsof -ti ":$PORT" || true)"
  if [ -n "$PORT_PID" ]; then
    echo "port $PORT is already in use by pid: $PORT_PID"
    exit 1
  fi
fi

if command -v tmux >/dev/null 2>&1 && tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
  tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true
fi

if [ -x "$SCRIPT_DIR/$APP_NAME" ]; then
  if command -v tmux >/dev/null 2>&1; then
    tmux new-session -d -s "$TMUX_SESSION" "cd \"$SCRIPT_DIR\" && exec \"$SCRIPT_DIR/$APP_NAME\" > \"$LOG_FILE\" 2>&1"
    PID="$(tmux display-message -p -t "$TMUX_SESSION" "#{pane_pid}")"
  else
    nohup "$SCRIPT_DIR/$APP_NAME" > "$LOG_FILE" 2>&1 &
    PID="$!"
  fi
elif [ -f "$SCRIPT_DIR/cmd.go" ]; then
  if command -v tmux >/dev/null 2>&1; then
    tmux new-session -d -s "$TMUX_SESSION" "cd \"$SCRIPT_DIR\" && exec go run cmd.go > \"$LOG_FILE\" 2>&1"
    PID="$(tmux display-message -p -t "$TMUX_SESSION" "#{pane_pid}")"
  else
    nohup go run cmd.go > "$LOG_FILE" 2>&1 &
    PID="$!"
  fi
else
  echo "no executable '$APP_NAME' or cmd.go found in $SCRIPT_DIR" >&2
  exit 1
fi

echo "$PID" > "$PID_FILE"

i=0
while [ "$i" -lt "$START_TIMEOUT" ]; do
  if ! kill -0 "$PID" 2>/dev/null; then
    rm -f "$PID_FILE"
    echo "$APP_NAME failed to start, see log: $LOG_FILE" >&2
    if [ -s "$LOG_FILE" ]; then
      tail -n 80 "$LOG_FILE" >&2
    fi
    exit 1
  fi

  if command -v lsof >/dev/null 2>&1 && lsof -ti ":$PORT" >/dev/null 2>&1; then
    echo "$APP_NAME started, pid: $PID, port: $PORT, log: $LOG_FILE"
    exit 0
  fi

  sleep 1
  i=$((i + 1))
done

if kill -0 "$PID" 2>/dev/null; then
  echo "$APP_NAME started, pid: $PID, port: $PORT, log: $LOG_FILE"
  echo "$APP_NAME is still initializing or port check is unavailable after ${START_TIMEOUT}s" >&2
  exit 0
fi

rm -f "$PID_FILE"
echo "$APP_NAME failed to start, see log: $LOG_FILE" >&2
exit 1
