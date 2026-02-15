# Modernization Roadmap

This is the sequenced plan for modernizing ExifCleaner. Phases are ordered by the maintainer's priorities: **local app quality first, release infrastructure later**.

---

## Phase 1: Replace Build System ✅ DONE

- ✅ Removed `electron-webpack`, `electron-webpack-ts`, and `webpack`
- ✅ Replaced with `electron-vite` 5.x + Vite 7.x + esbuild
- ✅ Configured 3 build targets: main, preload, renderer
- ✅ HMR preserved for dev mode
- ✅ CSS imports work (imported in `renderer/index.ts`)
- ✅ All `package.json` scripts updated (`dev`, `compile`, `start`)

## Phase 2: Upgrade Core Dependencies ✅ DONE

- ✅ TypeScript 3.8 → 5.7 with `strict: true` + `verbatimModuleSyntax: true`
- ✅ Prettier 2.1 → 3.x
- ✅ Electron 11 → 35 with contextIsolation + sandbox + preload
- ✅ @types/node ^12 → ^22
- ✅ Renderer fully sandboxed — no Node.js, no Electron imports
- ✅ Preload script with contextBridge API (exif, i18n, files namespaces)
- ✅ Exiftool operations moved from renderer to main process (single long-lived process)

## Phase 3: ESM Module Support ✅ DONE

- ✅ Added `"type": "module"` to package.json
- ✅ Enabled `verbatimModuleSyntax: true` — enforces `import type` for type-only imports
- ✅ Build output is ESM for all targets (main, preload, renderer)
- ✅ `node-exiftool` CJS module works through esbuild's interop layer

---

## Phase 4: Verify + Cleanup ✅ DONE

**Why**: Four chunks of infrastructure changes with zero automated tests. Before building anything new, confirm what works and clean up dead weight.

**Tasks**:

- ✅ Manual walkthrough of every code path (drag-drop, File > Open, context menu, dark mode, packaged app)
- ✅ **Removed `source-map-support`** from `dependencies` — never imported anywhere in source, dead weight. Modern Node 22 has built-in `--enable-source-maps`
- ✅ Fixed drag-and-drop bug: `file.path` deprecated in Electron 35 sandboxed renderer → exposed `webUtils.getPathForFile()` through preload API
- ✅ Fixed `update_exiftool.pl` for new Windows distribution format (versioned subdirectory + `exiftool_files/` companion directory)
- ✅ Set up Chrome DevTools MCP for AI-assisted debugging (`yarn dev:debug` + MCP server config)

## Phase 5: Playwright E2E Tests

**Why**: Safety net BEFORE any refactoring or feature work. The DDD refactor will be gradual — every file move should pass the test suite. Every new feature should get a test.

**Tasks**:

- Add `@playwright/test` as devDependency
- Create test fixtures (small JPEG with EXIF, PNG without EXIF, PDF, MP4)
- Write core tests:
  - App launches, shows empty state with i18n text
  - Files process via IPC path (simulating drag-and-drop via `file-open-add-files`)
  - Before-count > 0, after-count = 0, correct filename displayed
  - Multiple files process and all complete
  - Dark mode CSS applies with `prefers-color-scheme: dark`
  - All `[i18n]` elements have non-empty text
- Add `"test:e2e"` script to `package.json`
- Target: < 30 seconds for full suite, zero flakey tests

## Phase 6: DDD Architecture Refactor (In Progress)

**Why**: Clean layer boundaries make the codebase easier to extend and maintain. Gradual, not all-at-once — each step is a file-move PR that passes all E2E tests.

**Architecture**:

- **Domain layer**: Core types, value objects, pure business logic (i18n lookup is already pure)
- **Application layer**: Commands (strip metadata) and Queries (read metadata)
- **Infrastructure layer**: ExifTool binary wrapper, file I/O, Electron APIs ✅ **Started** — `src/infrastructure/exiftool/` created
- **Presentation layer**: Renderer DOM, preload bridge

**Principles**: SRP classes + dependency injection, functional programming for business logic, strong type system design (branded types, discriminated unions, `Result<T,E>`), no `any`.

**Suggested sequence**:

1. Extract domain types — `src/domain/` with value objects (`FilePath`, `ExifData`, `ProcessingResult`), enums (`Platform`, `Locale`). Move pure logic out of `common/`
2. ✅ **Extract infrastructure layer** — ExifTool wrapper → `src/infrastructure/exiftool/` (completed out of order in Phase 10). Remaining: file dialog → `src/infrastructure/electron/`, resources/binaries → `src/infrastructure/filesystem/`
3. Extract application layer — command/query objects: `StripMetadataCommand`, `ReadMetadataQuery`, `ExpandFolderQuery`
4. Extract presentation layer — renderer → `src/presentation/renderer/`, preload → `src/presentation/preload/`

## Phase 7: Community Features (High Priority)

**Why**: After architecture is cleaner, ship the most-requested user features. Each feature gets a Playwright test.

**Features**:

- **Preserve rotation/orientation metadata** (issues #209, #234) — option to keep EXIF orientation tag so images don't flip. Highest user demand.
- **Folder recursion** (issues #171, #231) — process all files inside a dropped folder. Requires new IPC channel (renderer is sandboxed, main process does `fs.readdirSync(path, { recursive: true })`)
- **Language switching from menu** (issue #244, labeled high priority) — allow users to change language without changing system locale. Store preference, override `app.getLocale()`
- **Extended filesystem attributes** (issue #86, labeled high priority) — remove macOS xattr/mdls metadata. Post-processing step: `xattr -cr <filepath>` guarded by `isMac()`
- **WebP support verification** (issue #264) — WebP should already be supported via exiftool, may just need docs/testing
- **Save as new file** (issues #218, #124) — option to output cleaned files separately instead of overwriting

## Phase 8: UI/UX Design Overhaul

**Why**: The current UI is functional but visually dated. After DDD separates the presentation layer cleanly and community features add new UI surface, do a single coherent visual design pass.

**Design Principles**:

- **System-native feel** — match platform design language, respect OS-level preferences (dark mode, accent colors, reduced motion)
- **Focused utility** — this is a single-purpose tool, keep the interface minimal and elegant, don't add visual clutter
- **Zero frameworks** — everything is vanilla CSS + TypeScript, hand-rolled

**Tasks**:

- **System font stack**: replace any custom/generic fonts with `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
- **BEM CSS methodology**: migrate from current flat class names (`.card`, `.empty-title`, `.popover`) to BEM naming (`.file-list__row`, `.file-list__row--processing`, `.empty-state__icon`) — rename all classes and update HTML/TS references
- **Micro-animations**: subtle CSS transitions for file processing states, drag-drop feedback, completion checkmarks, hover states — CSS `transition`/`@keyframes` only, no JS animation libraries
- **Respect `prefers-reduced-motion`**: wrap animations in `@media (prefers-reduced-motion: no-preference)` so users who disable motion aren't affected
- **Drag-drop polish**: visual feedback for drag-over state, file landing animation
- **Processing states**: progress indicators per file, success/error state styling
- **Dark mode refinement**: ensure dark mode looks intentionally designed, not just inverted colors
- **Spacing and layout**: refine the CSS custom property scale, ensure consistent visual rhythm

---

## Phase 9: GitHub Actions CI

**Why**: No CI exists. PR #174 has a community-contributed GitHub Actions config that was never merged. Now that E2E tests exist (Phase 5), CI has tests to run.

**Tasks**:

- Review PR #174 for useful patterns
- Set up GitHub Actions workflow:
  - Build on all 3 platforms (macOS, Windows, Linux)
  - Run Prettier lint check, typecheck, E2E tests
  - Cache exiftool downloads using `--cache-downloads-working-dir` flag (already supported by `update_exiftool.pl`)
  - Build artifacts for each platform
- **Future improvement**: Containerize cross-platform packaging with Docker for reproducible builds

## Phase 10: Dependency Cleanup ✅ DONE (completed out of order)

**Why**: Hand-roll what you can. Target zero production dependencies. The hand-rolled exiftool wrapper naturally lives in `src/infrastructure/exiftool/`, which jumpstarts the DDD architecture (Phase 6).

**Tasks**:

- ✅ **Replaced `node-exiftool`** with hand-rolled wrapper (~240 lines) in `src/infrastructure/exiftool/ExiftoolProcess.ts`
  - Implements `-stay_open` protocol with command queue and stdout buffering
  - Handles `{ready<N>}` markers, 30s command timeout, graceful shutdown
  - Drop-in replacement: same method signatures, same `{ data, error }` result format
- ✅ **Achieved zero production dependencies** — `package.json` has `"dependencies": {}`
  - Removed `node-exiftool` 2.3.0 (unmaintained since 2018, CJS bloat)
  - Removed `source-map-support` (already handled in Phase 4)
- ✅ Verified with `npx tsc --noEmit` (zero errors) and `yarn compile` (build successful)

## Phase 11: ExifTool Binary Update

**Why**: Issue #236. Current bundled exiftool is v12.25 (from May 2021). Security-critical — exiftool CVEs have been found before (CVE-2021-22204). Deferred until CI + tests are in place to catch regressions.

**Tasks**:

- Run `update_exiftool.pl` to pull latest binaries (requires Perl, Linux/macOS)
- Verify checksums match official exiftool site
- Run E2E tests — confirm all pass
- Run CI — confirm builds on all platforms
- Test that metadata removal still works for all supported file types

## Phase 12: Apple Silicon & Code Signing

**Why**: Issue #198. macOS users on M1/M2/M3 need a universal binary. Currently x64 only. Requires CI (Phase 9) and Apple Developer certificate.

**Tasks**:

- Configure electron-builder for universal macOS builds (`target: "universal"`)
- Set up code signing for macOS (requires Apple Developer certificate)
- Set up code signing for Windows (optional but reduces false positives — issue #262 reports VirusTotal flags)
- Ensure GitHub Actions CI produces signed artifacts
- Generate and publish checksums for all release artifacts (issue #141 — Linux RPM checksum missing)

## Phase 13: CI Releases (No Auto-Update)

**Why**: The final "ship it" phase. Everything else must be done first. Releases are **never** auto-published — maintainer explicitly triggers them. **No auto-update** in the app (users are privacy-conscious, zero network traffic is a feature). SHASUMS256.txt for every release.

---

## Key Constraints

- Keep the app simple — this is a focused tool, avoid feature bloat
- **Minimize dependencies** — prefer hand-rolling over npm packages; target zero production deps
- No JS frameworks — vanilla TypeScript/CSS is a deliberate design choice
- **BEM CSS naming** — all new CSS must use BEM convention (Phase 8 migrates existing)
- **System fonts only** — no web font downloads, no bundled fonts
- **Respect motion preferences** — wrap animations in `prefers-reduced-motion` media query
- Support Windows, macOS, and Linux
- Maintain backward compatibility for existing translation contributors
- ExifTool binaries must be bundled (no runtime download requirement)
- **NEVER auto-publish releases** — CI builds artifacts, maintainer publishes manually
- **NEVER enable auto-update** — no network traffic in production, ever
