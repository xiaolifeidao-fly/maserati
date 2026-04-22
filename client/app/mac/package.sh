#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$APP_DIR"
rm -rf ./dist/*
npm run build

if [ -f .env ]; then
  cp .env ./dist/
fi
