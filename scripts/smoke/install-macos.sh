#!/usr/bin/env bash
# Install a packaged macOS DMG the way a user would, for smoke testing.
#
#   usage: install-macos.sh <path-to-dmg> <dest-dir>
#   stdout (last line): absolute path to the executable inside the installed .app
#   stderr: progress logs
#
# Contract note: only the final stdout line is the path, so callers can do
#   APP=$(scripts/smoke/install-macos.sh dist/*arm64.dmg /tmp/smoke)
# Everything informational goes to stderr.
#
# The Gatekeeper gate is deliberately NOT run here — it lives in
# scripts/gatekeeper_check.mjs and operates on its own quarantined copy, so it can
# be invoked independently and unit-tested. Run both from the workflow.

set -uo pipefail

DMG="${1:-}"
DEST="${2:-}"

if [ -z "$DMG" ] || [ -z "$DEST" ]; then
	echo "usage: install-macos.sh <path-to-dmg> <dest-dir>" >&2
	exit 2
fi

if [ ! -f "$DMG" ]; then
	echo "error: no such DMG: $DMG" >&2
	exit 1
fi

MOUNT_POINT="$(mktemp -d /tmp/exifcleaner-dmg-XXXXXX)"

cleanup() {
	# Detach races are a classic macOS CI flake; retry, then force.
	for _ in 1 2 3; do
		if hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null; then
			rmdir "$MOUNT_POINT" 2>/dev/null || true
			return
		fi
		sleep 2
	done
	hdiutil detach "$MOUNT_POINT" -force -quiet 2>/dev/null || true
	rmdir "$MOUNT_POINT" 2>/dev/null || true
}
trap cleanup EXIT

echo "==> mounting $DMG" >&2
if ! hdiutil attach "$DMG" -nobrowse -readonly -noautoopen -mountpoint "$MOUNT_POINT" >&2; then
	echo "error: hdiutil attach failed" >&2
	exit 1
fi

# Discover the bundle name by glob rather than hardcoding — productName changes
# would otherwise silently break this with a confusing "not found".
APP_SOURCE="$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" -print -quit)"
if [ -z "$APP_SOURCE" ]; then
	echo "error: no .app bundle found in $MOUNT_POINT" >&2
	exit 1
fi

APP_NAME="$(basename "$APP_SOURCE")"
mkdir -p "$DEST"
APP_DEST="$DEST/$APP_NAME"
rm -rf "$APP_DEST"

# ditto, NOT cp -R: ditto preserves extended attributes, symlinks, and the code
# signature. A .app is largely symlinks (Contents/Frameworks/*.framework/Versions/
# Current), and a copy that flattens them produces a bundle that fails codesign
# verification for reasons that have nothing to do with the build.
echo "==> copying $APP_NAME to $DEST" >&2
if ! ditto "$APP_SOURCE" "$APP_DEST"; then
	echo "error: ditto failed" >&2
	exit 1
fi

EXECUTABLE_NAME="$(basename "$APP_NAME" .app)"
EXECUTABLE="$APP_DEST/Contents/MacOS/$EXECUTABLE_NAME"

if [ ! -x "$EXECUTABLE" ]; then
	echo "error: expected executable not found or not executable: $EXECUTABLE" >&2
	exit 1
fi

echo "==> installed OK" >&2
echo "$EXECUTABLE"
