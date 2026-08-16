#!/usr/bin/env bash
# Creates (once) a stable self-signed code-signing identity for local builds.
#
# Why: ad-hoc signing (`codesign -s -`) produces a new cdhash on every rebuild, so
# macOS TCC grants (Accessibility, system audio) stop matching and the app keeps
# re-prompting. A fixed certificate keeps the designated requirement stable, so a
# granted permission survives rebuilds.
#
# The identity lives in a dedicated keychain with a known password so signing is
# non-interactive (no "allow codesign to access key" popups).

set -euo pipefail

IDENTITY_NAME="${NETEASEFLOAT_SIGN_IDENTITY:-NeteaseFloat Local}"
KEYCHAIN_NAME="neteasefloat-signing.keychain"
KEYCHAIN_PATH="$HOME/Library/Keychains/${KEYCHAIN_NAME}-db"
KEYCHAIN_PASSWORD="neteasefloat-local"

# Reuse the existing certificate whenever possible: regenerating it would change
# the signature and invalidate every permission granted so far.
# (`find-identity -v` is not usable here — it hides untrusted self-signed certs.)
if [ -f "$KEYCHAIN_PATH" ] && security find-certificate -c "$IDENTITY_NAME" "$KEYCHAIN_PATH" >/dev/null 2>&1; then
  security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
  echo "signing identity ready: $IDENTITY_NAME"
  exit 0
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# Self-signed leaf marked for code signing; 10 year lifetime for local use.
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$WORK_DIR/key.pem" \
  -out "$WORK_DIR/cert.pem" \
  -days 3650 \
  -subj "/CN=$IDENTITY_NAME/O=NeteaseFloat/C=CN" \
  -addext "basicConstraints=critical,CA:false" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=critical,codeSigning" >/dev/null 2>&1

openssl pkcs12 -export \
  -inkey "$WORK_DIR/key.pem" \
  -in "$WORK_DIR/cert.pem" \
  -name "$IDENTITY_NAME" \
  -out "$WORK_DIR/identity.p12" \
  -passout pass:"$KEYCHAIN_PASSWORD" >/dev/null 2>&1

if [ ! -f "$KEYCHAIN_PATH" ]; then
  security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_NAME"
fi
security set-keychain-settings "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

security import "$WORK_DIR/identity.p12" \
  -k "$KEYCHAIN_PATH" \
  -P "$KEYCHAIN_PASSWORD" \
  -T /usr/bin/codesign \
  -T /usr/bin/security >/dev/null

# Let codesign use the key without an interactive keychain prompt.
security set-key-partition-list \
  -S apple-tool:,apple:,codesign: \
  -s -k "$KEYCHAIN_PASSWORD" \
  "$KEYCHAIN_PATH" >/dev/null 2>&1

# Keep the user's existing keychains searchable, append ours.
EXISTING=$(security list-keychains -d user | sed 's/[",]//g' | xargs)
if ! printf '%s\n' "$EXISTING" | grep -q "$KEYCHAIN_NAME"; then
  # shellcheck disable=SC2086
  security list-keychains -d user -s $EXISTING "$KEYCHAIN_PATH"
fi

echo "created signing identity: $IDENTITY_NAME"
