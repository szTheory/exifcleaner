# Changelog

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
- GitHub Actions release workflow with macOS code signing and notarization
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
