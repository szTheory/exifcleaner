#!/usr/bin/env bash
# Install a packaged Linux AppImage for smoke testing.
#
#   usage: install-linux.sh <path-to-appimage> <dest-dir>
#   stdout (last line): absolute path to the executable
#   stderr: progress logs
#
# Uses --appimage-extract rather than mounting. FUSE availability on GitHub runners
# has changed more than once historically and is the most reliable way to make an
# AppImage job flaky. Extraction is built into the AppImage runtime itself and works
# identically whether FUSE is present or not, so there is no detect-then-branch.

set -uo pipefail

APPIMAGE="${1:-}"
DEST="${2:-}"

if [ -z "$APPIMAGE" ] || [ -z "$DEST" ]; then
	echo "usage: install-linux.sh <path-to-appimage> <dest-dir>" >&2
	exit 2
fi

if [ ! -f "$APPIMAGE" ]; then
	echo "error: no such AppImage: $APPIMAGE" >&2
	exit 1
fi

APPIMAGE_ABS="$(cd "$(dirname "$APPIMAGE")" && pwd)/$(basename "$APPIMAGE")"

mkdir -p "$DEST"
DEST_ABS="$(cd "$DEST" && pwd)"

chmod +x "$APPIMAGE_ABS"

echo "==> extracting $(basename "$APPIMAGE_ABS")" >&2
rm -rf "$DEST_ABS/squashfs-root"
if ! (cd "$DEST_ABS" && "$APPIMAGE_ABS" --appimage-extract >/dev/null); then
	echo "error: --appimage-extract failed" >&2
	exit 1
fi

# AppRun is the AppImage-standard entry point. Preferred over guessing the inner
# binary's name/casing: it is name-invariant across productName changes, and it
# exec()s the real binary so the PID and stdout pipe Playwright needs to find the
# CDP endpoint are preserved. It also sets LD_LIBRARY_PATH for the bundled libs.
EXECUTABLE="$DEST_ABS/squashfs-root/AppRun"

if [ ! -x "$EXECUTABLE" ]; then
	echo "error: expected executable not found or not executable: $EXECUTABLE" >&2
	ls -la "$DEST_ABS/squashfs-root" >&2 || true
	exit 1
fi

echo "==> extracted OK" >&2
echo "$EXECUTABLE"
