# ExifCleaner 4.8.0

ExifCleaner 4.8.0 checks a cleaned file before Overwrite replaces your original, cleans WebP files with its built-in cleaner by default, and fixes Save as copy for colour JPEGs.

## What's new

- **Overwrite checks the cleaned file first.** For JPG, JPEG, PNG, WebP, HEIC, HEIF and AVIF, ExifCleaner now writes the cleaned file next to the original, reopens it with ExifTool, runs the leftover-metadata check, syncs it to disk (a full fsync on macOS) and confirms your original did not change. Only then does it replace the original. If any step fails, your original stays as it was. TIFF and media files already worked this way.
- **The built-in cleaner handles Overwrite when it can.** ExifTool writes the file only when the built-in cleaner declines it before writing, for example a HEIC it cannot read. Turning on Preserve timestamps does not send a file to ExifTool.
- **WebP uses the built-in cleaner by default.** With Save as copy on and Preserve resolution on, WebP files were cleaned by ExifTool in earlier versions. The built-in cleaner now keeps the resolution too, so it cleans them. A WebP copy or overwrite that fails the leftover-metadata check is discarded and your original is kept. The check was tried on 23 WebP variants with both cleaners, and none had to be refused.
- **Colour JPEGs now save as copies.** From 4.5.0 to 4.7.0, Save as copy of a colour JPEG could end in "Couldn't verify cleaned output". The check was flagging the JPEG's chroma subsampling, which describes how the picture is encoded, not the photo. It now accepts it. The failed attempts never changed your original.
- **Colour profiles pass the check with Preserve color profile on.** A JPEG, PNG or AVIF with an sRGB, Adobe RGB or Display P3 profile no longer fails on the profile's own descriptive entries. With the setting off, none of the profile's entries are kept. An entry that was not measured still fails the check.
- **A failed check says why.** The file's detail line now shows the check code and the names of the unexpected tags, at most eight, never tag values or file paths. Click the line to copy it. Tag names can come from the file itself, such as PNG text keywords or XMP property names, so a name can be unfamiliar.
- **A changed original stops the overwrite.** If another app, such as a cloud sync client, changes or locks the file while ExifCleaner works, the overwrite stops, reports that your original is unchanged and keeps it.

Thanks to zbruceli for reporting the colour JPEG problem and proposing fixes. We reimplemented them with tests rather than merging them as written.

## Changes to be aware of

- **Overwrite replaces the file.** It swaps in the cleaned file instead of editing yours in place. A file of your own keeps its owner and permissions and, when your system allows it, its group. A symbolic link at the path is replaced by the cleaned file, and the old target is left alone. We have not measured the result for a file owned by a different user.
- **An existing hard link keeps the old bytes and metadata.** Only the path you cleaned gets the cleaned file, so another hard link to the same file still holds the original, uncleaned data.
- **Extended attributes, ACLs and alternate data streams are not carried to the new file.**
- **Windows:** On Windows the file's creation time changes, because the cleaned file is a new file. 4.7.0 kept it. A read-only file on Windows is not overwritten and the original is kept, the same outcome as before 4.8.0. POSIX permissions do not apply.
- **macOS and Linux:** the file keeps its permissions, including read-only (0444), 0640 and 0600, the same as before 4.8.0.
- **TIFF and media files** already used the staged commit. On macOS and Linux a read-only or 0640 TIFF or media file keeps its permissions, as before.
- **Time cost.** The extra checks take a few milliseconds per file. Measured on one Apple Silicon Mac under background load: WebP Save as copy takes 8.0 to 8.3 ms more per file (about 4 s more per 500 files). Overwrite of JPG, PNG, WebP, HEIC and AVIF files takes 8.4 to 12.1 ms more per file than 4.7.0 (about 4.2 to 6.0 s more per 500 files). Windows and Linux were not measured.

<!-- exifcleaner-known-limitations:start v1 -->
## Known limitations in 4.8.0

No executable release-blocking known gaps are approved for this release; documented format constraints follow below.
<!-- exifcleaner-known-limitations:end -->




### Format constraints

- **TIFF:** only the first page of a multi-page TIFF is cleaned; later pages keep their own ImageDescription, Software, Artist and Copyright. HostComputer, DocumentName and CameraSerialNumber also remain on the first page.
- **RAW:** some Canon maker-note tags stay because ExifTool cannot delete them (for example the CR2 maker-note SerialNumber). The RAW fix was measured on CR2, CR3, DNG and RW2 samples; no claim is made for ARW, NEF, ORF, PEF or SRW. RAF cleaning is still refused and the source is left unchanged.
- **Time limits:** a write's limit is 30 seconds plus one second per 20 MB of the file. 20 MB per second is an assumed floor for slow disks, not a measured speed. With Save as copy off, for the formats ExifTool still rewrites in place (GIF, BMP, SVG and PDF), a stop that lands just after ExifTool replaced the original leaves the original cleaned even though the app reports a failure.
- **PDF:** ExifTool uses reversible updates, so prior metadata may remain recoverable.
- **MKV:** unsupported because ExifTool does not expose a writable removal path.
- **HEIC, HEIF and AVIF color profiles:** when the built-in cleaner declines a file and ExifTool cleans the copy with Preserve color profile off, ExifTool cannot remove the embedded color profile, so the copy keeps it.
- **Leftover metadata check:** if ExifTool's copy of a declined HEIC, HEIF or AVIF file still fails the leftover-metadata check, the copy is discarded, the file is reported as failed, and the original is left untouched.
- **iPhone HDR photos:** cleaning an iPhone HDR HEIC loses Apple's HDR brightness information, so the copy can display as standard dynamic range. This was measured on one iPhone 13 Pro Max photo on macOS. Earlier versions using ExifTool did the same, so this is not new in 4.6.0.
- **Windows HEIF Image Extension:** cleaned HEIC and AVIF copies were not tested in the Windows HEIF Image Extension.

## Rollback

If 4.8.0 does not work on your computer, reinstall 4.7.0 from the [releases page](https://github.com/szTheory/exifcleaner/releases/tag/v4.7.0). Trade-offs: 4.7.0 still fails Save as copy on some colour JPEGs with "Couldn't verify cleaned output", it overwrites JPG, PNG, WebP, HEIC, HEIF and AVIF files in place without the new check, there will be no further 4.7.0 changes, and ExifCleaner does not check for updates, so it will not prompt you to move.

*For maintainers:* a rollback from source uses the exifcleaner-node 0.4.0 pin that 4.7.0 shipped with. 4.8.0 pins 0.5.0.

The full list is in [CHANGELOG.md](https://github.com/szTheory/exifcleaner/blob/master/CHANGELOG.md).

## Downloads

| Platform | File |
| --- | --- |
| **Windows portable (recommended)** | `ExifCleaner.4.8.0.portable.exe` |
| Windows installer | `ExifCleaner.Setup.4.8.0.exe` |
| macOS (Apple Silicon) | `ExifCleaner-4.8.0-arm64.dmg` |
| macOS (Intel) | `ExifCleaner-4.8.0.dmg` |
| Linux (AppImage) | `ExifCleaner-4.8.0.AppImage` |
| Linux (Debian/Ubuntu) | `exifcleaner_4.8.0_amd64.deb` |
| Linux (Fedora/RHEL) | `exifcleaner-4.8.0.x86_64.rpm` |

Verify downloads against the release's `SHASUMS256.txt` file.

## Opening unsigned builds

ExifCleaner remains unsigned. Signing would require publishing the maintainer's verified legal identity; no signed build is being promised.

- **macOS 14 and earlier:** right-click or Control-click the app, choose **Open**, then choose **Open** again.
- **macOS 15 and later:** open the app once, then use **System Settings → Privacy & Security → Open Anyway**.
- **Windows:** if SmartScreen appears, choose **More info → Run anyway** after verifying the checksum.
- **Linux:** make the AppImage executable with `chmod +x ExifCleaner-4.8.0.AppImage`; `.deb` and `.rpm` packages install normally.

Every artifact is built publicly from tagged source by GitHub Actions. ExifCleaner makes no network requests during normal use.

Only download ExifCleaner from the [GitHub releases page](https://github.com/szTheory/exifcleaner/releases).

**Full changelog:** https://github.com/szTheory/exifcleaner/compare/v4.7.0...v4.8.0
