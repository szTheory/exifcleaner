The first major release in 5 years — a complete rebuild from the ground up. Same privacy-first philosophy, everything else modernized.

## Highlights

### New Privacy Controls
- **Preserve photo orientation** — Photos stay upright after cleaning (enabled by default)
- **Save as copy** — Create a `_cleaned` copy instead of overwriting the original
- **Preserve timestamps** — Keep original file dates intact
- **Preserve color profile** — Retain ICC color data for accurate colors
- **Remove macOS extended attributes** — Strip quarantine and Spotlight metadata (macOS only)

All toggleable from the new Settings panel.

### Folder Support
Drop an entire folder and ExifCleaner processes every supported file inside, recursively.

### Metadata Inspector
Click any processed file to see exactly which metadata tags were removed — a full before/after diff.

### 25 Languages
Now available in 25 languages with in-app language switching — no need to change your system locale.

New since v3.6.0: Catalan, Croatian, Czech, Danish, Hungarian, Malayalam, Persian, Polish, Portuguese (Brazil), Slovak, Swedish, Turkish, Vietnamese

### Redesigned Interface
- Modern React-based UI with a clean design system
- Dark mode that follows your system preference (or override manually)
- Settings drawer with all options in one place
- Status bar showing progress, file counts, and tags removed

### Under the Hood
- **Electron 35** (up from 11) — 5 years of Chromium security patches
- **Sandboxed renderer** — the UI process has zero access to your filesystem or system
- **IPC validation** — all internal communication validated with schemas
- **Smaller bundle** — ~35 MB on macOS
- **Automated CI/CD** — every commit tested across macOS, Windows, and Linux
- **SHA-256 checksums** included for all downloads

### What hasn't changed
- **Zero network traffic** — no telemetry, no auto-update, no phone home. Ever.
- **Fast** — hundreds of files processed in seconds
- **Open source** — MIT license

---

## Downloads

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `ExifCleaner-4.0.0-arm64.dmg` |
| macOS (Intel) | `ExifCleaner-4.0.0.dmg` |
| Windows (installer) | `ExifCleaner.Setup.4.0.0.exe` |
| Windows (portable) | `ExifCleaner.4.0.0.exe` |
| Linux (AppImage) | `ExifCleaner-4.0.0.AppImage` |
| Linux (Debian/Ubuntu) | `exifcleaner_4.0.0_amd64.deb` |
| Linux (Fedora/RHEL) | `exifcleaner-4.0.0.x86_64.rpm` |

Verify your download: check `SHASUMS256.txt` against the file you downloaded.

### macOS: opening unsigned apps

ExifCleaner is not yet code-signed with an Apple Developer certificate. macOS will warn you on first launch:

- **macOS Ventura and earlier**: Right-click the app > Open > click "Open" in the dialog
- **macOS Sequoia 15.0+**: Open **System Settings > Privacy & Security**, scroll down, and click **"Open Anyway"** next to the ExifCleaner message

You only need to do this once — after that the app opens normally.

---

## Contributors

Thank you to everyone who contributed translations and code:

@bsonmez (Turkish), @milotype (Croatian), @icetee (Hungarian), @sastofficial (Swedish), @theunknownKiran (Malayalam), @tomz00 (Czech), @tensingnightco (Vietnamese), @PolpOnline (code quality)

**Full Changelog**: https://github.com/szTheory/exifcleaner/compare/v3.6.0...v4.0.0
