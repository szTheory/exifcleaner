# Modernization Roadmap

This is the sequenced plan for modernizing ExifCleaner. Phases are ordered by dependency — each phase unblocks subsequent ones.

## Phase 1: Replace Build System

**Why first**: `electron-webpack` and `electron-webpack-ts` are abandoned packages that pin us to Electron 11, TypeScript 3.8, and webpack 4. Nothing else can be upgraded until these are removed.

**Context**: PR #160 attempted to upgrade to Electron 13 and remove electron-webpack but was blocked by ESM module loading issues. Electron 28+ now supports ESM natively, so this blocker is resolved.

**Tasks**:

- Remove `electron-webpack`, `electron-webpack-ts`, and `webpack` from devDependencies
- Remove `electron-webpack.json` config file
- Remove `tsconfig.json` extension of `electron-webpack/tsconfig-base.json`
- Choose replacement: `electron-vite` (Vite-based, minimal config, good Electron support) is the recommended option
- Configure separate entry points for main process and renderer process
- Preserve HMR for dev mode
- Ensure CSS imports continue to work (currently imported in `renderer/index.ts`)
- Update all `package.json` scripts (`dev`, `compile`, `start`)

## Phase 2: Upgrade Core Dependencies

**Tasks**:

- Upgrade Electron 11 → latest (currently 35+)
  - Review and fix breaking API changes across major versions
  - Enable `contextIsolation: true` and `nodeIntegration: false` (Electron security best practices)
  - Set up `preload.ts` script for IPC bridge (replaces direct `ipcRenderer` usage in renderer)
  - Update `BrowserWindow` options in `window_setup.ts`
- Upgrade TypeScript 3.8 → 5.x
  - Update `@types/node` to match Electron's Node version
  - Fix any type errors from stricter checking
- Upgrade Prettier 2.1 → 3.x
- Upgrade `electron-builder` to latest

## Phase 3: Update ExifTool Binaries

**Why**: Issue #236. Current bundled exiftool is v12.25 (from May 2021). Security-critical — exiftool CVEs have been found before (CVE-2021-22204).

**Tasks**:

- Run `update_exiftool.pl` to pull latest binaries (requires Perl, Linux/macOS)
- Verify checksums match official exiftool site
- Test that metadata removal still works for all supported file types
- Consider whether `node-exiftool` 2.3.0 wrapper still works with latest exiftool or needs updating

## Phase 4: ESM Module Support

**Why**: Issue #247. Modern Node/Electron support ESM. This enables using modern npm packages that are ESM-only.

**Tasks**:

- Add `"type": "module"` to package.json (or use `.mts` extensions)
- Convert `require()` calls to `import` statements (most already use `import` syntax thanks to TypeScript)
- Ensure electron-vite handles ESM correctly for both processes
- Test that `node-exiftool` works in ESM context

## Phase 5: GitHub Actions CI

**Why**: No CI exists. PR #174 has a community-contributed GitHub Actions config that was never merged.

**Tasks**:

- Review PR #174 for useful patterns
- Set up GitHub Actions workflow:
  - Build on all 3 platforms (macOS, Windows, Linux)
  - Run Prettier lint check
  - Cache exiftool downloads using `--cache-downloads-working-dir` flag (already supported by `update_exiftool.pl`)
  - Build artifacts for each platform
- Consider adding automated smoke tests (currently only manual testing per README)

## Phase 6: Apple Silicon & Code Signing

**Why**: Issue #198. macOS users on M1/M2/M3 need a universal binary. Currently x64 only.

**Tasks**:

- Configure electron-builder for universal macOS builds (`target: "universal"`)
- Set up code signing for macOS (requires Apple Developer certificate)
- Set up code signing for Windows (optional but reduces false positives — issue #262 reports VirusTotal flags)
- Ensure GitHub Actions CI produces signed artifacts
- Generate and publish checksums for all release artifacts (issue #141 — Linux RPM checksum missing)

## Phase 7: Dependency Cleanup

**Tasks**:

- Evaluate `source-map-support` — modern Node.js has built-in source map support, this dep may be removable
- Audit `node-exiftool` — check if there's a more maintained alternative, or if a thin custom wrapper around exiftool CLI would be simpler
- Run `npm audit` / `yarn audit` and resolve vulnerabilities
- Remove any unused transitive dependencies introduced by old toolchain

## Phase 8: Community Issues (High Priority)

After the infrastructure is modernized, address the most-requested features:

- **Language switching from menu** (issue #244, labeled high priority) — allow users to change language without changing system locale
- **Preserve rotation/orientation metadata** (issues #209, #234) — option to keep EXIF orientation tag so images don't flip
- **Extended filesystem attributes** (issue #86, labeled high priority) — remove macOS xattr/mdls metadata
- **WebP support verification** (issue #264) — WebP should already be supported via exiftool, may just need docs/testing
- **Folder recursion** (issues #171, #231) — process all files inside a dropped folder
- **Save as new file** (issues #218, #124) — option to output cleaned files separately instead of overwriting

## Key Constraints

- Keep the app simple — this is a focused tool, avoid feature bloat
- Minimize runtime dependencies (currently only 2 production deps)
- No JS frameworks — vanilla TypeScript/CSS is a deliberate design choice
- Support Windows, macOS, and Linux
- Maintain backward compatibility for existing translation contributors
- ExifTool binaries must be bundled (no runtime download requirement)
