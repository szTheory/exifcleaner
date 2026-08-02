# ExifCleaner 4.0.1

ExifCleaner 4.0.1 is a focused data-safety and release-reliability update.

## Data safety

- **Save as copy now preserves the original.** The app writes to the actual collision-safe `_cleaned` path and Reveal follows that returned path.
- **RAW files always use a copy.** Supported RAW formats never overwrite the submitted original, even when Save as copy is disabled.
- **RAW and video output is verified before success.** Failed generated output is removed instead of being reported as complete.

## Privacy

- **Remove macOS attributes is now connected to the processing path.** When enabled, it clears extended attributes from the artifact that was actually written.
- The macOS attribute command now passes filenames as fixed arguments rather than through a shell.

## Release reliability

- Installed builds now exercise the save-as-copy and advertised-format contracts on macOS, Windows, and Linux before release artifacts are accepted.
- Release notes must match the package version, known gaps must remain machine-readable, and two-part internal tags are rejected from the public release namespace.
- The release also includes the previously unreleased SIZE display, settings icon, PDF fixture, per-launch test-profile, and release-gate fixes from #300, #301, #305, #306, and #292.

<!-- exifcleaner-known-limitations:start v1 -->
## Known limitations in 4.0.1

- Impact: A cleaned MP4 may still include original create-date metadata values.
  Scope: MP4 files with QuickTime CreateDate, TrackCreateDate, or MediaCreateDate values processed through ExifCleaner 4.0.0 or 4.0.1
  Workaround: For sensitive MP4s, run ExifTool manually with -CreateDate= -TrackCreateDate= -MediaCreateDate= after cleaning, then verify those tags are absent.
  Target fix: 4.1.0.
  Issue: https://github.com/szTheory/exifcleaner/issues/240
<!-- exifcleaner-known-limitations:end -->



See the README's [known limitations by format](https://github.com/szTheory/exifcleaner#known-limitations-by-format) before relying on irreversible removal from PDF or MKV files.

## Downloads

| Platform | File |
| --- | --- |
| **Windows portable (recommended)** | `ExifCleaner.4.0.1.exe` |
| Windows installer | `ExifCleaner.Setup.4.0.1.exe` |
| macOS (Apple Silicon) | `ExifCleaner-4.0.1-arm64.dmg` |
| macOS (Intel) | `ExifCleaner-4.0.1.dmg` |
| Linux (AppImage) | `ExifCleaner-4.0.1.AppImage` |
| Linux (Debian/Ubuntu) | `exifcleaner_4.0.1_amd64.deb` |
| Linux (Fedora/RHEL) | `exifcleaner-4.0.1.x86_64.rpm` |

Verify downloads against the release's `SHASUMS256.txt` file.

<!-- exifcleaner-windows-security:start v1 -->
## Windows security checks

Exact VirusTotal links and Microsoft false-positive submission status will be added to the draft after the release artifacts are built.
<!-- exifcleaner-windows-security:end -->

## Opening unsigned builds

ExifCleaner remains unsigned. Signing would require publishing the maintainer's verified legal identity; no signed build is being promised.

### macOS

- **macOS 14 (Sonoma) and earlier:** right-click or Control-click the app, choose **Open**, then choose **Open** again.
- **macOS 15 (Sequoia) and later:** open the app once, then use **System Settings → Privacy & Security → Open Anyway**.

### Windows

The portable build is the primary Windows download. If SmartScreen displays “Windows protected your PC,” choose **More info → Run anyway** after verifying the checksum.

### Linux

Make the AppImage executable with `chmod +x ExifCleaner-4.0.1.AppImage`. The `.deb` and `.rpm` packages install normally.

## Verification

- Every artifact is built publicly from tagged source by GitHub Actions.
- CI installs and exercises the native DMG, NSIS installer, and AppImage before assembling the draft.
- `SHASUMS256.txt` identifies the exact bytes published with this release.
- No automatic-update manifests are published; ExifCleaner continues to make zero network requests during normal use.

Only download ExifCleaner from the [GitHub releases page](https://github.com/szTheory/exifcleaner/releases).

**Full changelog:** https://github.com/szTheory/exifcleaner/compare/v4.0.0...v4.0.1
