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

cleanup_sharp_platform() {
  node scripts/ensure-sharp-platform.js --cleanup || true
}

build_mac_arch() {
  local target_arch="$1"

  cleanup_sharp_platform
  node scripts/ensure-sharp-platform.js --platform=darwin --arch="$target_arch"
  npx electron-builder --mac "--$target_arch"
  cleanup_sharp_platform
}

trap cleanup_sharp_platform EXIT

case "$ARCH" in
  x64|arm64)
    build_mac_arch "$ARCH"
    ;;
  all)
    build_mac_arch x64
    build_mac_arch arm64
    ;;
  *)
    echo "Unsupported mac arch: $ARCH. Use x86/x64, arm/arm64, or all." >&2
    exit 1
    ;;
esac
