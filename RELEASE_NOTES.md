# ExifCleaner 4.2.1

ExifCleaner 4.2.1 makes the supported-format promise match what the bundled metadata engine can safely process.

## Format support

- **M4A is now supported.** Audio metadata is removed through the same staged, verified publication path used by other media files.
- **MKV is no longer accepted.** ExifTool can read Matroska metadata but cannot write MKV files, so rejecting the format before processing is the truthful behavior.
- The README now lists the app's exact intake allowlist instead of ExifTool's much broader catalog, and CI prevents that list from drifting from source.
- DOCX remains unsupported.

The patch includes a metadata-bearing M4A fixture, explicit MKV rejection coverage, and installed-artifact M4A smoke coverage.

<!-- exifcleaner-known-limitations:start v1 -->
## Known limitations in 4.2.1

No executable release-blocking known gaps are approved for this release; documented format constraints follow below.
<!-- exifcleaner-known-limitations:end -->


### Format constraints

- **RAF:** cleaning is refused and the source is left unchanged because a safe cleaned RAF artifact cannot currently be guaranteed.
- **PDF:** ExifTool uses reversible updates, so prior metadata may remain recoverable.
- **MKV:** unsupported because ExifTool does not expose a writable removal path.
- **TIFF and AVIF:** user-reported partial-removal behavior remains under investigation.

## Downloads

| Platform | File |
| --- | --- |
| **Windows portable (recommended)** | `ExifCleaner.4.2.1.exe` |
| Windows installer | `ExifCleaner.Setup.4.2.1.exe` |
| macOS (Apple Silicon) | `ExifCleaner-4.2.1-arm64.dmg` |
| macOS (Intel) | `ExifCleaner-4.2.1.dmg` |
| Linux (AppImage) | `ExifCleaner-4.2.1.AppImage` |
| Linux (Debian/Ubuntu) | `exifcleaner_4.2.1_amd64.deb` |
| Linux (Fedora/RHEL) | `exifcleaner-4.2.1.x86_64.rpm` |

Verify downloads against the release's `SHASUMS256.txt` file.

## Opening unsigned builds

ExifCleaner remains unsigned. Signing would require publishing the maintainer's verified legal identity; no signed build is being promised.

- **macOS 14 and earlier:** right-click or Control-click the app, choose **Open**, then choose **Open** again.
- **macOS 15 and later:** open the app once, then use **System Settings → Privacy & Security → Open Anyway**.
- **Windows:** if SmartScreen appears, choose **More info → Run anyway** after verifying the checksum.
- **Linux:** make the AppImage executable with `chmod +x ExifCleaner-4.2.1.AppImage`; `.deb` and `.rpm` packages install normally.

Every artifact is built publicly from tagged source by GitHub Actions. ExifCleaner makes no network requests during normal use.

Only download ExifCleaner from the [GitHub releases page](https://github.com/szTheory/exifcleaner/releases).

**Full changelog:** https://github.com/szTheory/exifcleaner/compare/v4.2.0...v4.2.1
