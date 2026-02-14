# ExifCleaner

Cross-platform Electron desktop app to strip EXIF/metadata from images, videos, and PDFs. Wraps bundled `exiftool` Perl binaries. MIT license.

## Tech Stack

- **Runtime**: Electron 11 (Chromium + Node.js)
- **Language**: TypeScript 5.7 with `strict: true` (type-check only, electron-vite/esbuild compiles)
- **Build**: electron-vite 5.x + Vite 7.x + esbuild
- **Packaging**: electron-builder 22.8 (produces .dmg, .AppImage, .deb, .rpm, .exe, portable)
- **UI**: Vanilla HTML/CSS/TypeScript — no frameworks (React, Vue, etc.)
- **Core dep**: `node-exiftool` 2.3.0 wrapping bundled exiftool Perl binaries
- **Formatting**: Prettier 3.x with tabs

## Commands

```bash
yarn dev              # Dev mode with HMR (electron-vite dev server)
yarn compile          # Build with electron-vite (esbuild)
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
- `nix/bin/exiftool` — macOS/Linux exiftool binary (NOT in git — `.keep` placeholder only, run `update_exiftool.pl` to download)
- `win/bin/exiftool.exe` — Windows exiftool binary (same — `.keep` placeholder only)
- `icon.png` (15KB), `check.png` (133B) — app and checkmark icons

## Directory Reference

```text
.resources/          Runtime resources bundled into app
  strings.json       i18n dictionary (30KB, 24 languages)
  icon.png           App icon (15KB PNG)
  check.png          Checkmark icon (133B PNG)
  nix/bin/.keep      Placeholder for Unix exiftool binary
  win/bin/.keep      Placeholder for Windows exiftool.exe

build/               electron-builder packaging assets
  icon.icns          macOS app icon (256KB)
  icon.png           Generic icon (15KB)
  background.png     DMG installer background
  background@2x.png  DMG installer background (Retina)

static/              Source assets
  icon.svg           1024x1024 vector logo (source for all icon formats)

src/
  main/              15 files — Electron main process
  renderer/          14 TS files + index.html — UI logic
  common/            8 files — shared between processes
  styles/            11 CSS files — theming and layout
  types/             1 file — node-exiftool type definitions
```

Root config: `.prettierrc` (tabs), `.gitattributes` (`* text=auto eol=lf`), `electron.vite.config.ts` (build config for main + renderer), `tsconfig.json` (strict, ES2021 target, bundler moduleResolution), `update_exiftool.pl` (Perl, downloads+verifies exiftool binaries).

## Build & Release Procedures

### Dev Workflow

`yarn dev` → `electron-vite dev` → starts Vite dev server on port 5173 → main process loads renderer via localhost. Prefixed with `ELECTRON_RUN_AS_NODE=` to prevent Cursor IDE env contamination.

### Compilation

`yarn compile` → `electron-vite build` → outputs to `out/`:

- `out/main/index.js` — main process bundle (~18 kB)
- `out/renderer/index.html` + `assets/index-*.js` + `assets/index-*.css` — renderer bundle

### Packaging

`yarn pack{mac,win,linux}` = `yarn compile && electron-builder --{platform}`. Mac pack adds `-c.mac.identity=null` to skip code signing. Test build: `yarn packmactest` uses `--dir` (no DMG) with store compression.

### Release Process (Two Steps)

1. `yarn release` → runs `np` → prompts for version → bumps `package.json` → git commit + tag → pushes → creates GitHub release draft
2. `yarn publish` → `yarn compile && electron-builder --macos --linux --windows -p always` → builds all platforms → uploads artifacts to GitHub release → manually remove draft flag on GitHub

### ExifTool Binary Update

`update_exiftool.pl` (Perl script):

1. Fetches checksums from `https://exiftool.org/checksums.txt`
2. Downloads source tarball (Unix) and zip (Windows) to `exiftool_downloads/`
3. Verifies SHA1 checksums (dies on mismatch)
4. Extracts and copies: Unix `exiftool` + `lib/` → `.resources/nix/bin/`, Windows `.exe` → `.resources/win/bin/`
5. Flag `--cache-downloads-working-dir` preserves downloads between runs (useful for CI)

### Postinstall

`electron-builder install-app-deps` runs after `yarn install` — rebuilds native modules for Electron's Node version.

## Code Patterns

- **Exports**: Named exports only — no default exports anywhere in codebase
- **Async**: Promise `.then()` chains preferred over async/await; `.finally()` for cleanup; `.catch()` often swallows errors silently
- **File processing**: Generator function `filePath()` yields paths, consumed by recursive `processFile()` that distributes work across ExifTool process pool
- **DOM**: Pure native API — `createElement()`, `querySelector()`, `querySelectorAll('[i18n]')`, `classList.add/remove`, `appendChild`
- **IPC convention**: Event constants exported from the module that sets up the listener (e.g., `EVENT_FILES_ADDED` from `dock.ts`). `ipcMain.handle`/`ipcRenderer.invoke` for request-response, `ipcMain.on`/`ipcRenderer.send` for fire-and-forget
- **Platform guards**: Early-return pattern — `if (!isMac()) return;`
- **TypeScript**: `strict: true` — strong null checks, no implicit any. Explicit `any` kept only for truly dynamic exiftool metadata. Custom `.d.ts` for `node-exiftool` with named result interfaces
- **CSS**: Custom properties in `vars.css` (spacing scale `--unit-1` through `--unit-16`, color tokens), flat class names currently — migrating to BEM in design overhaul (Phase 9), dark mode via `@media (prefers-color-scheme: dark)`, pure CSS popovers/animations (no JS animation libs)
- **i18n**: HTML `i18n` attribute + `strings.json` dictionary → renderer calls `setupI18n()` which queries all `[i18n]` elements → locale fallback chain: regional (e.g. `zh-CN`) → base (`zh`) → English
- **Resource paths**: `resourcesPath()` returns `.resources/` in dev, `process.resourcesPath` in production — used by `binaries.ts` and `i18n.ts`

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
| `electron-vite` | ^5.0.0 | Build system | Vite-based, replaces electron-webpack |
| `vite` | ^7.3.1 | Module bundler/dev server | Powers electron-vite |
| `typescript` | ~5.7.0 | Language compiler | `strict: true` enabled |
| `@types/node` | ^12.0 | Node.js type defs | Matches Electron 11's Node 12.18 — upgrade with Electron in Chunk 3 |
| `prettier` | ^3.0 | Code formatter | Trailing commas default to "all" |

## Code Conventions

- **Formatting**: Prettier with tabs (not spaces), configured in `.prettierrc`
- **No frameworks**: Pure vanilla DOM manipulation, no React/Vue/Angular
- **Module style**: ESNext modules via electron-vite/esbuild (full ESM deferred to Chunk 4)
- **Naming**: snake_case for filenames, camelCase for functions/variables
- **CSS naming**: Currently flat classes; migrating to BEM in Phase 9 (e.g. `.file-list__row--processing`)
- **Fonts**: System font stack only — no external font loading, no bundled fonts
- **Dependencies**: Prefer hand-rolling over adding npm packages — target zero production deps
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

TypeScript config: standalone `tsconfig.json` with `strict: true`, target ES2021, `moduleResolution: "bundler"`. tsc is type-check only (`--noEmit`); electron-vite/esbuild handles compilation.

### Future: Docker for Packaging

Cross-platform packaging will eventually be containerized with Docker for reproducible CI builds across all target platforms. Tracked as a future improvement after the build system migration.

## Safety Rules

- **NEVER push releases or publish packages to GitHub/npm.** All releases will be handled via CI in the future. Do not run `yarn publish`, `npm publish`, `gh release create`, or any command that pushes artifacts to GitHub releases.

## Security

- v3.6.0 fixed XSS via crafted EXIF metadata (use `sanitize.ts` pattern for any exiftool output)
- v3.5.0 updated exiftool for CVE-2021-22204 (arbitrary code execution)
- ExifTool binaries should be kept up to date — use `yarn run update-exiftool`
- No network traffic in production (no auto-updates, no telemetry)

## CI

A `.travis.yml` exists but is minimal (lint + `tsc` on Node 14/16, no builds, macOS disabled). No GitHub Actions. Replace with GitHub Actions as part of modernization.

## Current State (as of Feb 2026)

- Last release: v3.6.0 (May 2021)
- 64 open issues, 8 open PRs
- No CI/CD pipeline
- No automated tests
- **Completed**: Chunk 1 (electron-webpack → electron-vite), Chunk 2 (TypeScript 5.7 + strict + Prettier 3.x)
- **Next**: Chunk 3 (Electron 11 → 35+), Chunk 4 (ESM), Chunk 5 (ExifTool update), Chunk 6 (dep cleanup)
- See `devplans/` for detailed upgrade plans
- See `.claude/rules/modernization-roadmap.md` for the master roadmap
- See `.claude/rules/github-context.md` for community issues summary
