# Changelog

## 4.4.0

### Added

- A **Preserve resolution** setting, on by default, keeps a cleaned file's print resolution (DPI) exactly as the source recorded it — JPEG JFIF and EXIF resolution and PNG pHYs — so printed sizes do not change; GPS, author, software and comment metadata are still removed. Existing settings pick it up turned on after upgrading. Turning it off restores the previous behavior of removing resolution too

### Fixed

- Corrected a 4.0.0 changelog entry that falsely claimed the release workflow performs macOS code signing and notarization; releases are unsigned by explicit maintainer policy (#362)
- TIFF files cleaned with default settings no longer keep the descriptive and camera tags on their first page's main image directory (IFD0) — ImageDescription, Make, Model, Software, ModifyDate, Artist, Copyright, Rating and the Windows XP title, comment, author, keyword and subject tags — which ExifTool's blanket `-all=` delete cannot remove from a TIFF; image data is unchanged. TIFF writes now go through the staged, verified output path in both save-as-copy and overwrite mode, so a failed write leaves the original untouched (#199)
- RAW files (CR2, CR3, DNG, RW2 and the other supported RAW formats) cleaned with default settings no longer keep identifying text (Artist, Software, ImageDescription, Copyright, the Windows XP title/comment/author/keyword/subject tags and the user comment), camera body and lens serial numbers, owner names, the DNG raw-data ID and original raw file name, or capture dates and time offsets that ExifTool can delete; Make, Model and the DNG camera and color tags are kept unchanged, and the image data is unchanged

### Verified

- Files larger than 4 GB, such as long videos, have been cleaned successfully since 4.0.0. ExifTool 12.88 (July 2024) made its large-file support the default, and 4.0.0 was the first ExifCleaner release to bundle a newer ExifTool (13.50; this release bundles 13.59). ExifCleaner's own code did not change for this. 4.4.0 adds a regression test whose negative control reproduces the old "LargeFileSupport not enabled" failure, so a future ExifTool update cannot silently bring it back.

### Known limitations

- Only the first page of a multi-page TIFF is cleaned; later pages keep their own ImageDescription, Software, Artist and Copyright, because ExifTool cannot delete a later page's tag directory without also deleting its image data. HostComputer, DocumentName and CameraSerialNumber also remain on the first page — they sit outside the tag set the fix above removes.
- Some RAW maker-note tags stay because ExifTool cannot delete them: on CR2, the Canon maker-note SerialNumber; on CR3, the Canon maker-note ImageUniqueID, TimeZone, TimeZoneCity and DaylightSavings, and the capture TimeStamp in its metadata track. The Canon maker-note OwnerName (CR2, CR3) and InternalSerialNumber (CR3) are emptied rather than removed. The app's still-present tag count includes these residual tags without telling them apart from ordinary structural fields. The RAW fix was measured on CR2, CR3, DNG and RW2 sample files — ARW, NEF, ORF, PEF and SRW have no test file and no claim is made for them. RAF files are still refused and left untouched.
- With Save as copy on, WebP files are cleaned by the built-in WebP cleaner, which does not keep resolution, whether Preserve resolution is on or off. WebP resolution is kept only when Save as copy is off.
- A file whose write takes longer than 30 seconds is reported as a failed clean, but the cleaning engine keeps writing in the background: with Save as copy on, this leaves a full-size, unverified copy of the cleaned output that the app never reports; with Save as copy off, it leaves a hidden, similarly full-size file beside the original that the app also never reports (measured). The original file itself is never changed (measured). On the local SSD this was measured on (about 2.1 GB/s), that 30-second cutoff lands at around 62 GB; slower disks reach it at correspondingly smaller file sizes, which is not separately measured here. If that write is still running when the app moves on to the next file in the same batch, that next file can also fail with its own 30-second timeout (the mechanism is measured; the exact size threshold is derived from the measured throughput above, not independently measured per file). When the destination disk runs out of space entirely, the write fails outright and leaves no partial output file behind; the original file is confirmed unchanged (measured on a small dedicated test volume).

## 4.2.1

### Added

- M4A metadata removal through the same transactional verification path as other supported media

### Changed

- The README now lists the app's exact tested intake allowlist and CI rejects format-list drift

### Fixed

- MKV files are rejected at intake because the bundled ExifTool cannot write them

## 4.2.0

### Added

- Romanian translation with contributor-preserved wording and reviewable per-key provenance
- A user-initiated **New Releases** item in the Help menu
- Complete first-run vocabulary across every supported locale

### Changed

- The empty intake is now one centered, responsive composition with a clear primary file action, secondary folder action, and truthful output-mode reassurance
- ExifTool is updated to 13.59 for Unix and 32-bit-compatible Windows packages with pinned upstream SHA-256 verification
- Packaged Electron disables RunAsNode, `NODE_OPTIONS`, and Node CLI inspection while leaving cookie encryption disabled
- Translation tooling reports legacy gaps without overwriting community strings or presenting assisted drafts as human-reviewed work

### Fixed

- Re-running release automation for an already-published version exits quietly without downloading artifacts or mutating release state
- Folder intake reports unsupported files and unreadable folders instead of dropping that accounting at the IPC boundary

## 4.1.0

### Added

- Truthful per-file outcomes, before/after size display, stable table sorting, and immediately visible removed metadata
- Native file and folder pickers with a visible output-mode summary and unsupported-file feedback
- Architecture, code walkthrough, subsystem, contribution, and translation documentation with drift checks

### Changed

- New installs default to Save as copy; existing settings retain their chosen behavior
- MP4/MOV cleaning explicitly clears QuickTime movie, track, and media date fields
- Dependency and CI baselines were refreshed, with pinned Actions and an exact release-artifact inventory
- Vietnamese locale handling uses the standard `vi` code; locale resources are independently reviewable

### Fixed

- RAF input is refused without mutation instead of producing an artifact that cannot meet the cleaning contract
- Already-clean files no longer incur an unnecessary rewrite
- Carriage-return and line-feed paths are rejected before reaching ExifTool
- macOS window close/reopen follows the expected single-instance lifecycle

## 4.0.0

Complete modernization of ExifCleaner after a 5-year hiatus. Every layer of the application has been rebuilt — from Electron 11 to 35, vanilla DOM to React 19, loose scripts to DDD architecture, zero tests to 265 unit + 42 E2E tests.

### Security

- Upgrade to Electron 35 (from 11) with all Chromium security patches
- Content Security Policy (CSP) meta tag blocks eval, inline scripts, and remote resources
- Electron Fuses disable runAsNode, NODE_OPTIONS, and --inspect in production builds
- IPC payload validation with Zod schemas on all 16 channels
- IPC sender verification — only the authorized BrowserWindow can invoke handlers
- Navigation hardening — renderer cannot navigate to external URLs
- Permission gate — all Chromium permission requests denied by default
- Renderer fully sandboxed with contextIsolation, no Node.js access

### Added

- **Preserve orientation metadata** — option to keep EXIF rotation tag so photos don't flip (issues #209, #234)
- **Save as copy** — create `_cleaned` copy instead of overwriting original (issues #218, #124)
- **Remove macOS extended attributes** — strips xattr/quarantine metadata (issue #86)
- **Preserve file timestamps** — keep original created/modified dates
- **Folder recursion** — drop a folder to process all files inside recursively (issues #171, #231)
- **Metadata inspection** — expand any file to see before/after metadata diff
- **Language switching** — change language from settings without restarting (issue #244, 25 locales)
- **WebP support** verified working (issue #264)
- **Settings panel** with 5 privacy toggles, theme selector, and language picker
- **Dark mode** with intentional design respecting OS `prefers-color-scheme`
- Playwright E2E test suite (42 tests, 10 specs, ~30s)
- Vitest unit test suite (265 tests, ~1.4s)
- GitHub Actions CI — lint, typecheck, unit tests, E2E tests, cross-platform builds
- GitHub Actions release workflow builds and publishes unsigned installers for macOS, Windows, and Linux

  _Correction, 2026-09-22: this entry originally and incorrectly described the release workflow
  as performing macOS code signing and notarization. It never has. Releases are unsigned by
  explicit maintainer policy (#362)._

- SHASUMS256.txt generated automatically for all release artifacts
- Translations: Persian, Catalan, Croatian updates merged

### Changed

- **React 19 SPA** replaces vanilla DOM renderer — component architecture with BEM CSS design system
- **DDD architecture** — domain types, application commands/queries, infrastructure adapters, composition root
- **TypeScript 5.7** strict mode with all additional safety flags (noUncheckedIndexedAccess, exactOptionalPropertyTypes, etc.)
- **electron-vite 5 + Vite 7** replaces electron-webpack — faster builds, HMR, ESM
- **electron-builder 26** (from 22) with macOS universal binary support (Intel + Apple Silicon)
- **ExifTool v13.50** (from 12.25) with checksum verification
- **Hand-rolled ExifTool wrapper** replaces node-exiftool — implements -stay_open protocol directly (~240 lines)
- **Full ESM** — `"type": "module"` throughout, `verbatimModuleSyntax` enforced
- Platform requirements: macOS 10.15+, Windows 10+, Linux 64-bit (previously macOS 10.10+, Windows 7+)
- Typed error handling with discriminated unions across 4 error domains

### Removed

- `node-exiftool` npm dependency (replaced by hand-rolled wrapper)
- `source-map-support` (Node 22 has built-in source maps)
- Spectre CSS framework (replaced by BEM CSS with custom properties)
- `electron-webpack` and webpack (replaced by electron-vite)
- Travis CI configuration (replaced by GitHub Actions)
- Auto-update check on startup (never worked reliably, removed entirely)

## 3.6.0 - 4 May 2021

### Security

- Fix for XSS and Electron reverse shell vulnerabilities by sanitizing `exiftool` HTML output in the UI. To take advantage of this, an attacker would have had to write image metadata containing malicious script code to a file that you then download and run through ExifCleaner. Proofs of concept:

XSS:

```bash
exiftool -Comment='<img src=x onerror=alert("ok") /><b>OverJT</b>' -PixelUnits='meters' image.png
```

Electron reverse shell:

```bash
exiftool -Comment='<img src=x onerror=window.require("child_process").exec("/usr/bin/firefox") /><b>OverJT</b>' -PixelUnits='meters' image.png
```

## 3.5.1 - 1 May 2021

## Infrastructure

- Add support for Windows "portable" releases that don't require installation

## 3.5.0 - 1 May 2021

If you are running a previous version of ExifCleaner, update immediately due to a security vulnerability found in exiftool (the command-line tool that ExifCleaner uses under the hood). Thank you to all contributors for this release. As always, credits are listed in the README.

### Security

- Update exiftool to 12.25 to mitigate [CVE-2021-22204 arbitrary code execution](https://twitter.com/wcbowling/status/1385803927321415687)

### Features

- Add translations for Slovak, Russian, Ukranian, Danish, Arabic, Italian, Chinese (Mandarin)
- Add support for the new Mac M1 ARM processors

### Infrastructure

- Upgrade to Electron 11
- Update some NPM dependencies
- Start maintaining a CHANGELOG file in source control

### Fixes

- Translation fixes for Portuguese (Brazil) and French
- Update Linux AppImage category to fix exit status 1 issue

## 3.4.0 - 19 Oct 2020

### Features

- Huge speed increase for file processing, especially when batch processing many files with multiple CPUs (more efficient process pool algorithm, better integration with exiftool process keep-alive)
- Multilingual support with translations for French, Polish, Japanese, Spanish (Spain), German, and Portuguese (Brazil)
- Mac/Windows: show progress in dock when batch processing files
- Linux: fix app icon in dock
- Linux: dark mode works with Ubuntu

### Bug Fixes

- Linux: fix issue where icon.png was not found on startup with .deb installs

### Infrastructure

- Upgrade to Electron 10
- Upgrade to exiftool 12.08
- Add update_exiftool.pl Perl script to automate pulling down latest ExifTool binaries and verifying their checksums
- Remove a bunch of NPM dependencies

## 3.3.1 - 11 Jul 2020

- Change from JavaScript to TypeScript for improved stability of compiler static analysis.
- Fix Windows UTF-8 filename bug.
- Remove several NPM dependencies to simplify code.
- Upgrade to Electron 9.
- Minor UI polish.

## 3.2.0 - 27 Apr 2020

- Fix Linux version (was not using correct ExifTool binary path)
- Add File -> Open menu item
- Add dock icon for Linux AppImage
- Mac quit entire app when File -> Close menu item is selected
- Linux clean up About screen
- Update app start text to show that ExifCleaner also supports video and PDF files.

## 3.1.0 - 3 Feb 2020

- Drop target should follow window size when you resize it to be taller
- Set a minimium window size in BrowserWindow
- On macOS, when you close the window, the app should quit.
- night mode better icon display opacity
- night mode font not so thin
- remove Automatic updates from README (feature removed)

## 3.0.0 - 18 Jan 2020

- properly clean up after exiftool perl5.18 processes
- disable auto update
- remove esm dep. fix dev env
- disable unused preferences menu item. esm modules for import with node

## 2.1.0 - 10 Jan 2020

- electron 7.1.8 which should fix auto update issue in electron-build, according to some developer reports

## 2.0.0 - 4 Jan 2020

- electron 7.1.2 to fix electron-builder auto update regression

## 1.5.1 - 10 Dec 2019

- fix node url require

## 1.5.0 - 10 Dec 2019

- drastically simplify dark mode code
- debugging dark mode in Electron 6. clean up js functions/modules

## 1.4.0 - 10 Dec 2019

- downgrade to Electron 6 to fix auto-update

## 1.3.5 - 10 Dec 2019

- fix mainwindow callback null error

## 1.3.4 - 10 Dec 2019

- Automatic updates logger fix

## 1.3.3 - 10 Dec 2019

- Auto-updater debug logging

## 1.3.1 - 10 Dec 2019

- Fix popover hover bounds

## 1.3.0 - 8 Dec 2019

- Fix popover transparency
- Fix dark mode font color for exif values

## 1.1.0 - 8 Dec 2019

- First release.
