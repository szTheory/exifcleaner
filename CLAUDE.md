# ExifCleaner

Cross-platform Electron desktop app to strip EXIF/metadata from images, videos, and PDFs. Wraps bundled `exiftool` Perl binaries. MIT license.

## Tech Stack

- **Runtime**: Electron 35 (Chromium + Node 22) with contextIsolation + sandbox
- **Language**: TypeScript 5.7 with `strict: true` + `verbatimModuleSyntax: true` (type-check only, electron-vite/esbuild compiles)
- **Build**: electron-vite 5.x + Vite 7.x + esbuild (3 targets: main, preload, renderer)
- **Packaging**: electron-builder 22.8 (produces .dmg, .AppImage, .deb, .rpm, .exe, portable)
- **UI**: React 19 SPA with BEM CSS design system
- **ExifTool**: Hand-rolled wrapper in `src/infrastructure/exiftool/` wrapping bundled exiftool Perl binaries
- **Formatting**: Prettier 3.x with tabs
- **Dependencies**: Three production dependencies (react, react-dom, zod) — ExifTool wrapper is hand-rolled
- **Performance**: Processing speed is a core product value — the app must handle hundreds of files in seconds. Never add latency to the file processing pipeline.

## Commands

```bash
yarn dev              # Dev mode with HMR (electron-vite dev server)
yarn dev:debug        # Dev mode + Chrome DevTools Protocol on port 9222 (for MCP)
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

## Debugging

Chrome DevTools MCP is configured for AI-assisted debugging of the Electron app:

1. Run `yarn dev:debug` (launches app with `--remote-debugging-port=9222`)
2. Claude Code connects via the `chrome-devtools` MCP server to read console logs, take screenshots, evaluate JS

MCP config is in `.claude.json` (project-scoped). The server uses `chrome-devtools-mcp` npm package with `--browser-url=http://127.0.0.1:9222`.

## Architecture

Three-process Electron model: main, preload (contextBridge), renderer (sandboxed browser). Shared `common/` layer.

### Main Process (`src/main/`)

Entry: `index.ts` → `init.ts` (i18n, exif handlers, context menu, dock, app handlers) → `window_setup.ts` (BrowserWindow creation)

- `app_setup.ts` — single instance lock, lifecycle events, exiftool cleanup on quit
- `dock.ts` — IPC handlers for progress tracking, Mac dock badge, Windows taskbar flash
- `exif_handlers.ts` — exiftool IPC handlers (`exif:read`, `exif:remove`), uses hand-rolled `ExiftoolProcess` from infrastructure layer
- `file_open.ts` — native file dialog
- `menu*.ts` — menu bar templates (app, file, edit, view, window, help, dock)
- `i18n.ts` — main process i18n, exposes locale and strings via IPC

### Preload Script (`src/preload/`)

Bridge between isolated renderer and Node.js. Only file that uses `contextBridge`.

- `index.ts` — exposes `window.api` with exif, i18n, and files namespaces
- `api_types.ts` — TypeScript interfaces for the contextBridge API

### Renderer Process (`src/renderer/`)

Entry: `index.ts` → async setup (i18n, drag-drop, file selection menu). **Fully sandboxed** — no Node.js, no Electron imports. All external access through `window.api.*`.

- `drag.ts` — drag-and-drop event listeners on `document` (file.path is an Electron extension that persists with contextIsolation)
- `select_files.ts` → `add_files.ts` — core processing pipeline:
  1. For each file: add row → `window.api.exif.readMetadata()` → `window.api.exif.removeMetadata()` → read after → update row
  2. Notifies main process via `window.api.files.notify*()` for dock badge / progress bar
- `display_exif.ts` — coordinates before/after EXIF display via `window.api.exif`
- `table_add_row.ts` / `table_update_row.ts` — DOM table manipulation
- `sanitize.ts` — XSS prevention: uses `innerText` not `innerHTML` for exiftool output
- `selected_files.ts` / `empty_pane.ts` — UI state management
- `i18n.ts` — fetches strings via `window.api.i18n`, caches locally, uses pure `i18nLookup()` from common
- `env.d.ts` — ambient `window.api` type declaration

### Common (`src/common/`)

Shared between processes (main imports Node-dependent files, renderer imports pure files only):

- `binaries.ts` — resolves platform-specific exiftool binary path (main only)
- `i18n.ts` — loads `.resources/strings.json`, delegates to `i18n_lookup.ts` (main only)
- `i18n_lookup.ts` — pure i18n lookup: Locale enum, fallback logic, no Node.js deps (safe everywhere)
- `platform.ts` — `isMac()`, `isWindows()`, `isLinux()` helpers
- `browser_window.ts` — safe BrowserWindow reference helpers
- `resources.ts` — resource path resolution (dev vs production)
- `env.ts` — `isDev()` detection
- `ipc_events.ts` — IPC channel name constants

### Infrastructure (`src/infrastructure/`)

Hand-rolled wrappers for external processes (main process only):

- `exiftool/ExiftoolProcess.ts` — hand-rolled exiftool wrapper (~240 lines), implements `-stay_open` protocol with command queue, stdout buffering, graceful shutdown, 30s command timeout
- `exiftool/types.ts` — TypeScript interfaces (`ExifToolResult`, `ExifToolCloseResult`)

### IPC Channels (8 total)

- `"files-added"` — renderer → main (send): batch started with count
- `"file-processed"` — renderer → main (send): one file done
- `"all-files-processed"` — renderer → main (send): batch complete
- `"file-open-add-files"` — main → renderer (send): paths from file dialog
- `"get-locale"` — renderer → main (invoke): get system locale string
- `"get-i18n-strings"` — renderer → main (invoke): get full i18n dictionary
- `"exif:read"` — renderer → main (invoke): read metadata for one file
- `"exif:remove"` — renderer → main (invoke): strip metadata from one file

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
  main/              16 files — Electron main process (incl. exif_handlers.ts)
  preload/           2 files — contextBridge API (index.ts + api_types.ts)
  renderer/          12 TS files + index.html + env.d.ts — sandboxed UI
  common/            8 files — shared (i18n_lookup.ts is pure, others Node-dependent)
  infrastructure/    exiftool/ — hand-rolled ExifTool wrapper (ExiftoolProcess.ts + types.ts)
  styles/            11 CSS files — theming and layout
```

Root config: `.prettierrc` (tabs), `.gitattributes` (`* text=auto eol=lf`), `electron.vite.config.ts` (build config for main + preload + renderer), `tsconfig.json` (strict, verbatimModuleSyntax, ES2021 target, bundler moduleResolution), `update_exiftool.pl` (Perl, downloads+verifies exiftool binaries).

## Build & Release Procedures

### Dev Workflow

`yarn dev` → `electron-vite dev` → starts Vite dev server on port 5173 → main process loads renderer via localhost. Prefixed with `ELECTRON_RUN_AS_NODE=` to prevent Cursor IDE env contamination.

### Compilation

`yarn compile` → `electron-vite build` → outputs to `out/`:

- `out/main/index.js` — main process bundle (~20 kB)
- `out/preload/index.cjs` — preload script (~1 kB, CJS — Electron sandbox requires CJS)
- `out/renderer/index.html` + `assets/index-*.js` + `assets/index-*.css` — renderer bundle (~8 kB)

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
- **Async**: `async`/`await` in renderer, `.finally()` for cleanup
- **File processing**: `addFiles()` maps file paths to `Promise.all()`, each file processed sequentially (read → remove → read after) via IPC to main process exiftool
- **DOM**: Pure native API — `createElement()`, `querySelector()`, `querySelectorAll('[i18n]')`, `classList.add/remove`, `appendChild`
- **IPC convention**: Event constants in `common/ipc_events.ts`. Renderer accesses IPC only through `window.api.*` (contextBridge). `ipcMain.handle`/`ipcRenderer.invoke` for request-response, `ipcMain.on`/`ipcRenderer.send` for fire-and-forget
- **Platform guards**: Early-return pattern — `if (!isMac()) return;`
- **TypeScript**: `strict: true` + `verbatimModuleSyntax: true` — strong null checks, no implicit any, type-only imports enforced (`import type` or inline `type` keyword). Explicit `any` kept only for truly dynamic exiftool metadata
- **CSS**: Custom properties in `vars.css` (spacing scale `--unit-1` through `--unit-16`, color tokens), flat class names currently — migrating to BEM in design overhaul (Phase 9), dark mode via `@media (prefers-color-scheme: dark)`, pure CSS popovers/animations (no JS animation libs)
- **i18n**: HTML `i18n` attribute + `strings.json` dictionary → renderer `setupI18n()` fetches strings from main via IPC, caches locally, queries all `[i18n]` elements → locale fallback chain: regional (e.g. `zh-CN`) → base (`zh`) → English
- **Resource paths**: `resourcesPath()` returns `.resources/` in dev, `process.resourcesPath` in production — used by `binaries.ts` and `i18n.ts`

## Dependencies

### Production

**Three production dependencies** (react, react-dom, zod). ExifTool wrapper is hand-rolled:

- ExifTool wrapper: hand-rolled in `src/infrastructure/exiftool/` (~240 lines)
- IPC validation: Zod schemas for all 16 channels
- UI: React 19 SPA with BEM CSS design system

### Dev

| Package | Version | Purpose | Notes |
| --- | --- | --- | --- |
| `electron` | ^35.0 | App framework | contextIsolation + sandbox enabled |
| `electron-builder` | ^22.8 | Packaging/distribution | Works but outdated |
| `electron-vite` | ^5.0.0 | Build system | Vite-based, replaces electron-webpack |
| `vite` | ^7.3.1 | Module bundler/dev server | Powers electron-vite |
| `typescript` | ~5.7.0 | Language compiler | `strict: true` enabled |
| `@types/node` | ^22.0 | Node.js type defs | Matches Electron 35's Node 22 |
| `prettier` | ^3.0 | Code formatter | Trailing commas default to "all" |

## Code Conventions

- **Formatting**: Prettier with tabs (not spaces), configured in `.prettierrc`
- **No frameworks**: Pure vanilla DOM manipulation, no React/Vue/Angular
- **Module style**: Full ESM — `"type": "module"` in package.json, `verbatimModuleSyntax` enforced, build output is ESM for main + renderer, CJS for preload (Electron sandbox requires CJS)
- **Naming**: snake_case for filenames, camelCase for functions/variables
- **CSS naming**: Currently flat classes; migrating to BEM in Phase 9 (e.g. `.file-list__row--processing`)
- **Fonts**: System font stack only — no external font loading, no bundled fonts
- **Dependencies**: Prefer hand-rolling over adding npm packages — target zero production deps
- **Error handling**: throw strings in renderer, throw Error objects in main
- **Platform code**: guard with `isMac()` / `isWindows()` / `isLinux()` from `common/platform.ts`
- **Security**: always use `sanitize()` from `renderer/sanitize.ts` for exiftool output (XSS prevention)
- **i18n**: add translations to `.resources/strings.json`, use `i18n("key")` in main or `i18n` HTML attribute in renderer
- **Performance is sacred**: ExifCleaner's speed is a core competitive advantage. The app processes hundreds of files in seconds via ExifTool's `-stay_open` mode. Never add per-file overhead (no unnecessary IPC round-trips, no sync I/O in the processing loop, no heavy DOM operations per row). Batch operations should feel instant. If a design choice conflicts with speed, speed wins.

## Build & Packaging

Config is in `package.json` under `"build"`. App ID: `com.exifcleaner`.

- **macOS**: .dmg with custom layout. ExifTool binaries from `.resources/nix/bin/`
- **Linux**: AppImage + .deb + .rpm. ExifTool binaries from `.resources/nix/bin/`
- **Windows**: NSIS installer (x64 + ia32) + portable. ExifTool binaries from `.resources/win/bin/`
- **All platforms**: `strings.json` and `.png` icons copied via `extraResources`

TypeScript config: standalone `tsconfig.json` with `strict: true`, `verbatimModuleSyntax: true`, target ES2021, `moduleResolution: "bundler"`. tsc is type-check only (`--noEmit`); electron-vite/esbuild handles compilation.

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
- **Completed**: Chunk 1 (electron-webpack → electron-vite), Chunk 2 (TypeScript 5.7 + strict + Prettier 3.x), Chunk 3 (Electron 11 → 35 + contextIsolation + preload), Chunk 4 (ESM modules — verbatimModuleSyntax + type: module), Phase 4 (Verify + Cleanup), Chunk 6 (Zero production dependencies — hand-rolled ExifTool wrapper)
- **Next**: Phase 5 (Playwright e2e tests), then Phase 6 (DDD architecture refactor) — see `.claude/rules/modernization-roadmap.md`
- See `devplans/` for detailed upgrade plans
- See `.claude/rules/modernization-roadmap.md` for the master roadmap
- See `.claude/rules/github-context.md` for community issues summary
