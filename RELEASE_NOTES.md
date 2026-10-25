# ExifCleaner 4.6.0

ExifCleaner 4.6.0 cleans HEIC, HEIF and AVIF files with the app's own built-in cleaner when Save as copy is on, and no longer leaves a background ExifTool process running after a force-quit or crash.

## What's new

- **HEIC, HEIF and AVIF copies are now cleaned by the app's own built-in cleaner.** With Save as copy on, these files are cleaned by the built-in cleaner whenever it supports every preservation setting you have turned on. Files it declines to handle are cleaned by ExifTool as before. Every copy is reopened and checked for leftover metadata; if the check finds anything unexpected, the copy is discarded, your original file is left untouched, and the file is reported as failed.
- **Files are cleaned according to their real content.** If a file's name does not match its content (for example, AVIF data named `.heic`), it is cleaned according to its real content and keeps its name. If the built-in cleaner declines the file and ExifTool cannot write that combination, the write fails and the original file is preserved.
- **Force-quitting or crashing ExifCleaner no longer leaves a background ExifTool process running.** On macOS and Linux, ExifTool now exits within about a second of losing the app once it is between files. On Windows it is ended immediately, even mid-write. The original file is preserved either way.

## Other changes

- On macOS and Linux, the bundled ExifTool no longer reads a personal `~/.ExifTool_config` file. Windows still does.

<!-- exifcleaner-known-limitations:start v1 -->
## Known limitations in 4.6.0

No executable release-blocking known gaps are approved for this release; documented format constraints follow below.
<!-- exifcleaner-known-limitations:end -->


### Format constraints

- **TIFF:** only the first page of a multi-page TIFF is cleaned; later pages keep their own ImageDescription, Software, Artist and Copyright. HostComputer, DocumentName and CameraSerialNumber also remain on the first page.
- **RAW:** some Canon maker-note tags stay because ExifTool cannot delete them (for example the CR2 maker-note SerialNumber). The RAW fix was measured on CR2, CR3, DNG and RW2 samples; no claim is made for ARW, NEF, ORF, PEF or SRW. RAF cleaning is still refused and the source is left unchanged.
- **Time limits:** a write's limit is 30 seconds plus one second per 20 MB of the file. 20 MB per second is an assumed floor for slow disks, not a measured speed. With Save as copy off, for formats ExifTool rewrites in place such as JPEG and PNG, a stop that lands just after ExifTool replaced the original leaves the original cleaned even though the app reports a failure.
- **PDF:** ExifTool uses reversible updates, so prior metadata may remain recoverable.
- **MKV:** unsupported because ExifTool does not expose a writable removal path.
- **HEIC, HEIF and AVIF color profiles:** when the built-in cleaner declines a file and ExifTool cleans the copy with Preserve color profile off, ExifTool cannot remove the embedded color profile, so the copy keeps it.
- **Leftover metadata check:** if ExifTool's copy of a declined HEIC, HEIF or AVIF file still fails the leftover-metadata check, the copy is discarded, the file is reported as failed, and the original is left untouched.
- **iPhone HDR photos:** cleaning an iPhone HDR HEIC loses Apple's HDR brightness information, so the copy can display as standard dynamic range. This was measured on one iPhone 13 Pro Max photo on macOS. Earlier versions using ExifTool did the same, so this is not new in 4.6.0.
- **Windows HEIF Image Extension:** cleaned HEIC and AVIF copies were not tested in the Windows HEIF Image Extension.

## Rollback

If a 4.6.0 HEIC, HEIF or AVIF copy looks wrong, reinstall 4.5.0 from the [releases page](https://github.com/szTheory/exifcleaner/releases/tag/v4.5.0). The built-in cleaner handles these formats only when Save as copy is on and it supports every preservation setting you have turned on. With Save as copy off, ExifTool cleans the file as before, so that mode is unaffected. Reinstalling 4.5.0 also gives up the 4.6.0 fix for a leftover background ExifTool process after a force-quit or crash.

*For maintainers:* remove `heicHandler` and `avifHandler` from `HANDLERS` in `exifcleaner-node/src/admission/registry.ts`, publish a node patch, and bump the app's exact pin. This route is covered by `tests/integration/heif_rollback.test.ts` (“%s: native, rollback and restore runs agree on the user-visible outcome” for `.heic` and `.avif`), `exifcleaner-node/tests/qualification/kit/rollback.test.ts` (KIT-07), and `exifcleaner-node/docs/format-admission.md` §8. After a handler rollback, the reopen-and-leak-check still runs, so an ExifTool-written copy can fail the check and be reported failed with the original untouched; only reinstalling 4.5.0 restores the old behaviour.

The full list is in [CHANGELOG.md](https://github.com/szTheory/exifcleaner/blob/master/CHANGELOG.md).

## Downloads

| Platform | File |
| --- | --- |
| **Windows portable (recommended)** | `ExifCleaner.4.6.0.portable.exe` |
| Windows installer | `ExifCleaner.Setup.4.6.0.exe` |
| macOS (Apple Silicon) | `ExifCleaner-4.6.0-arm64.dmg` |
| macOS (Intel) | `ExifCleaner-4.6.0.dmg` |
| Linux (AppImage) | `ExifCleaner-4.6.0.AppImage` |
| Linux (Debian/Ubuntu) | `exifcleaner_4.6.0_amd64.deb` |
| Linux (Fedora/RHEL) | `exifcleaner-4.6.0.x86_64.rpm` |

Verify downloads against the release's `SHASUMS256.txt` file.

## Opening unsigned builds

ExifCleaner remains unsigned. Signing would require publishing the maintainer's verified legal identity; no signed build is being promised.

- **macOS 14 and earlier:** right-click or Control-click the app, choose **Open**, then choose **Open** again.
- **macOS 15 and later:** open the app once, then use **System Settings → Privacy & Security → Open Anyway**.
- **Windows:** if SmartScreen appears, choose **More info → Run anyway** after verifying the checksum.
- **Linux:** make the AppImage executable with `chmod +x ExifCleaner-4.6.0.AppImage`; `.deb` and `.rpm` packages install normally.

Every artifact is built publicly from tagged source by GitHub Actions. ExifCleaner makes no network requests during normal use.

Only download ExifCleaner from the [GitHub releases page](https://github.com/szTheory/exifcleaner/releases).

**Full changelog:** https://github.com/szTheory/exifcleaner/compare/v4.5.0...v4.6.0
