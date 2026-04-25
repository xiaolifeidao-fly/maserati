#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ARCH="${1:-all}"

case "$ARCH" in
  x86) ARCH="x64" ;;
  arm) ARCH="arm64" ;;
esac

sh "$SCRIPT_DIR/package.sh"
cd "$APP_DIR"

case "$ARCH" in
  x64)
    node scripts/ensure-sharp-platform.js --platform=win32 --arch=x64
    npx electron-builder --win "--$ARCH"
    ;;
  all)
    node scripts/ensure-sharp-platform.js --platform=win32 --arch=x64
    npx electron-builder --win --x64
    ;;
  *)
    echo "Unsupported win arch: $ARCH. Use x86/x64 or all." >&2
    exit 1
    ;;
esac
