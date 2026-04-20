#!/bin/bash

APP_DIR=$(cd "$(dirname "$0")/.." && pwd)
PIDS=""

for PID in $(pgrep -f "Electron.*--disable-gpu.*--no-sandbox"); do
  CWD=$(lsof -a -p "$PID" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
  if [ "$CWD" = "$APP_DIR" ]; then
    PIDS="$PIDS $PID"
  fi
done

if [ -z "$PIDS" ]; then
  echo "No Electron process is running for $APP_DIR"
  exit 0
fi

kill $PIDS
echo "Stopped Electron process(es):$PIDS"
