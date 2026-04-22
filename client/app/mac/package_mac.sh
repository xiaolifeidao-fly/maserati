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
  x64|arm64)
    npx electron-builder --mac "--$ARCH"
    ;;
  all)
    npx electron-builder --mac --x64 --arm64
    ;;
  *)
    echo "Unsupported mac arch: $ARCH. Use x86/x64, arm/arm64, or all." >&2
    exit 1
    ;;
esac
