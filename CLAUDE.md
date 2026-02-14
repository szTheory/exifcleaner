# ExifCleaner

Cross-platform Electron desktop app to strip EXIF/metadata from images, videos, and PDFs. Wraps bundled `exiftool` Perl binaries. MIT license.

## Tech Stack

- **Runtime**: Electron 11 (Chromium + Node.js)
- **Language**: TypeScript 3.8 (compiled via electron-webpack)
- **Build**: electron-webpack 2.8 + webpack 4 (both outdated/abandoned)
- **Packaging**: electron-builder 22.8 (produces .dmg, .AppImage, .deb, .rpm, .exe, portable)
- **UI**: Vanilla HTML/CSS/TypeScript — no frameworks (React, Vue, etc.)
- **Core dep**: `node-exiftool` 2.3.0 wrapping bundled exiftool Perl binaries
- **Formatting**: Prettier 2.1 with tabs

## Commands

```bash
yarn dev              # Dev mode with HMR (electron-webpack dev server)
yarn compile          # TypeScript compilation (electron-webpack)
yarn format           # Format code with Prettier
yarn lint             # Check formatting with Prettier

yarn packmac          # Build macOS .dmg (unsigned)
yarn packwin          # Build Windows .exe (NSIS + portable)
yarn packlinux        # Build Linux (.AppImage, .deb, .rpm)
yarn build            # Build all platforms
yarn publish          # Build all + publish to GitHub releases

yarn run update-exiftool  # Update exiftool binaries (requires Perl, Linux/Mac only)
```

## Architecture

Standard Electron two-process model with a shared `common/` layer.

### Main Process (`src/main/`)

Entry: `index.ts` → `init.ts` (i18n, context menu, dock, app handlers) → `window_setup.ts` (BrowserWindow creation)

- `app_setup.ts` — single instance lock, lifecycle events
- `dock.ts` — IPC handlers for progress tracking, Mac dock badge, Windows taskbar flash
- `file_open.ts` — native file dialog
- `menu*.ts` — menu bar templates (app, file, edit, view, window, help, dock)
- `i18n.ts` — main process i18n, exposes locale via IPC

### Renderer Process (`src/renderer/`)

Entry: `index.ts` → sets up drag-drop, i18n, file selection menu

- `drag.ts` — drag-and-drop event listeners on `document`
- `select_files.ts` → `add_files.ts` — core processing pipeline:
  1. Spawns ExifTool processes (1 per CPU core)
  2. Distributes files across processes via generators
  3. For each file: add row → read EXIF → remove EXIF → read EXIF after → update row
- `exif_remove.ts` — calls `exiftoolProcess.writeMetadata(path, {all: ""})` to strip all metadata
- `exif_get.ts` — reads metadata via `exiftoolProcess.readMetadata()`
- `display_exif.ts` — coordinates before/after EXIF display
- `table_add_row.ts` / `table_update_row.ts` — DOM table manipulation
- `sanitize.ts` — XSS prevention: uses `innerText` not `innerHTML` for exiftool output
- `selected_files.ts` / `empty_pane.ts` — UI state management

### Common (`src/common/`)

Shared between main and renderer processes:

- `exif_tool_processes.ts` — spawns ExifTool process pool (1 per CPU core, capped by file count)
- `binaries.ts` — resolves platform-specific exiftool binary path
- `i18n.ts` — loads `.resources/strings.json`, locale fallback logic
- `platform.ts` — `isMac()`, `isWindows()`, `isLinux()` helpers
- `browser_window.ts` — safe BrowserWindow reference helpers
- `resources.ts` — resource path resolution (dev vs production)
- `env.ts` — `isDev()` detection

### IPC Events

- `EVENT_FILES_ADDED` (`"files-added"`) — renderer → main: batch started
- `EVENT_FILE_PROCESSED` (`"file-processed"`) — renderer → main: one file done
- `EVENT_ALL_FILES_PROCESSED` (`"all-files-processed"`) — renderer → main: batch complete
- `IPC_EVENT_NAME_GET_LOCALE` (`"get-locale"`) — renderer → main: get system locale

### Styles (`src/styles/`)

11 CSS files. Uses CSS custom properties in `vars.css` for theming. Dark mode via `dark_mode.css` using `prefers-color-scheme`. No CSS framework.

### Resources (`.resources/`)

- `strings.json` — i18n translations (24 languages)
- `nix/bin/exiftool` — macOS/Linux exiftool binary
- `win/bin/exiftool.exe` — Windows exiftool binary
- `icon.png`, `check.png` — app icons

## Dependencies

### Production

| Package | Version | Purpose | Notes |
| --- | --- | --- | --- |
| `node-exiftool` | 2.3.0 | ExifTool process wrapper | Core dependency, essential |
| `source-map-support` | ^0.5 | Better stack traces for TS | May be removable with modern Node |

### Dev

| Package | Version | Purpose | Notes |
| --- | --- | --- | --- |
| `electron` | ^11.0 | App framework | Severely outdated (current: 35+) |
| `electron-builder` | ^22.8 | Packaging/distribution | Works but outdated |
| `electron-webpack` | ^2.8 | Build system | **Abandoned**, blocks all upgrades |
| `electron-webpack-ts` | ^4.0 | TS support for electron-webpack | **Abandoned**, depends on electron-webpack |
| `typescript` | ^3.8 | Language compiler | Outdated (current: 5.x) |
| `webpack` | ^4.41 | Module bundler | Outdated, dependency of electron-webpack |
| `@types/node` | ^12.0 | Node.js type defs | Outdated |
| `prettier` | 2.1 | Code formatter | Outdated (current: 3.x) |

## Code Conventions

- **Formatting**: Prettier with tabs (not spaces), configured in `.prettierrc`
- **No frameworks**: Pure vanilla DOM manipulation, no React/Vue/Angular
- **Module style**: CommonJS via webpack (ESM blocked until Electron upgrade)
- **Naming**: snake_case for filenames, camelCase for functions/variables
- **Error handling**: throw strings in renderer, throw Error objects in main
- **Platform code**: guard with `isMac()` / `isWindows()` / `isLinux()` from `common/platform.ts`
- **Security**: always use `sanitize()` from `renderer/sanitize.ts` for exiftool output (XSS prevention)
- **i18n**: add translations to `.resources/strings.json`, use `i18n("key")` in main or `i18n` HTML attribute in renderer

## Build & Packaging

Config is in `package.json` under `"build"`. App ID: `com.exifcleaner`.

- **macOS**: .dmg with custom layout. ExifTool binaries from `.resources/nix/bin/`
- **Linux**: AppImage + .deb + .rpm. ExifTool binaries from `.resources/nix/bin/`
- **Windows**: NSIS installer (x64 + ia32) + portable. ExifTool binaries from `.resources/win/bin/`
- **All platforms**: `strings.json` and `.png` icons copied via `extraResources`

TypeScript config extends `electron-webpack/tsconfig-base.json`. Target: ES2019. See `tsconfig.json`.

## Security

- v3.6.0 fixed XSS via crafted EXIF metadata (use `sanitize.ts` pattern for any exiftool output)
- v3.5.0 updated exiftool for CVE-2021-22204 (arbitrary code execution)
- ExifTool binaries should be kept up to date — use `yarn run update-exiftool`
- No network traffic in production (no auto-updates, no telemetry)

## CI

A `.travis.yml` exists but is minimal (lint + `tsc` on Node 14/16, no builds, macOS disabled). No GitHub Actions. Replace with GitHub Actions as part of modernization.

## Current State (as of Feb 2025)

- Last commit: March 2022 (translations)
- Last release: v3.6.0 (May 2021)
- 64 open issues, 8 open PRs
- No CI/CD pipeline
- No automated tests
- Build toolchain (electron-webpack) is abandoned and blocks modernization
- See `.claude/rules/modernization-roadmap.md` for the upgrade plan
- See `.claude/rules/github-context.md` for community issues summary
