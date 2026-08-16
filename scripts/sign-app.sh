#!/usr/bin/env bash
# Re-signs a packaged NeteaseFloat.app with the stable local identity so macOS
# permission grants (Accessibility, system audio) survive rebuilds.
#
# Usage: bash scripts/sign-app.sh [path/to/NeteaseFloat.app]

set -euo pipefail

APP_PATH="${1:-dist/mac-arm64/NeteaseFloat.app}"
IDENTITY_NAME="${NETEASEFLOAT_SIGN_IDENTITY:-NeteaseFloat Local}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -d "$APP_PATH" ]; then
  echo "app bundle not found: $APP_PATH" >&2
  exit 1
fi

bash "$SCRIPT_DIR/ensure-signing-identity.sh"

# Only the outer bundle is re-signed: deep re-signing rewrites the audiotee
# helper too, which resets its own system-audio TCC record.
codesign --force --sign "$IDENTITY_NAME" \
  --preserve-metadata=entitlements \
  "$APP_PATH"

codesign -dv --verbose=2 "$APP_PATH" 2>&1 | grep -E 'Identifier|Authority|Signature' || true
