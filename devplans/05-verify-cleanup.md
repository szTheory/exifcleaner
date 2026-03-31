# Phase 4: Verify + Cleanup — QA Runbook

**Prerequisite**: Chunks 1-4 complete (electron-vite, TypeScript 5.7 strict, Electron 35 + contextIsolation, ESM modules)

---

## Part 1: Developer Setup (Apple Silicon Mac)

### Prerequisites

You need these installed before anything else:

| Tool | Check | Install if missing |
|------|-------|--------------------|
| Node.js 20+ | `node --version` | `brew install node` or nvm |
| Yarn 1.x | `yarn --version` | `npm install -g yarn` |
| Perl 5 | `perl --version` | Pre-installed on macOS |
| curl | `which curl` | Pre-installed on macOS |
| wget | `which wget` | `brew install wget` |
| tar | `which tar` | Pre-installed on macOS |

### Step-by-Step Setup

```bash
# 1. Install dependencies
cd /Users/jon/projects/exifcleaner
yarn install

# 2. CRITICAL: Download exiftool binary
#    The .resources/nix/bin/ directory only has a .keep placeholder.
#    Without the actual binary, the app launches but crashes when
#    you try to process files.
./update_exiftool.pl

# 3. Verify the binary was downloaded
ls -la .resources/nix/bin/exiftool
# Should show a file ~25KB (it's a Perl script)
# Also check the lib directory:
ls .resources/nix/bin/lib/
# Should show many .pm files (Image/ExifTool/ directory tree)

# 4. Verify everything compiles
npx tsc --noEmit     # Type-check: should be zero errors
yarn compile         # Build: should produce 3 targets

# 5. Launch in dev mode
yarn dev
# This runs: ELECTRON_RUN_AS_NODE= electron-vite dev
# Opens a window. You should see:
#   - "No files selected" (or translated equivalent)
#   - "Drag and drop images, videos, or PDF files..."
#   - Table headers visible (Filename, EXIF Before, EXIF After)
```

### Build Commands Reference

| Command | What it does | When to use |
|---------|-------------|-------------|
| `yarn dev` | Starts Vite dev server + launches Electron. HMR for renderer. | Day-to-day development |
| `yarn compile` | Builds all 3 targets to `out/` | Before packaging, or to test production build |
| `yarn lint` | Prettier format check | Before committing |
| `yarn format` | Auto-format with Prettier | Fix formatting issues |
| `yarn packmactest` | Compile + package macOS app (unsigned, no DMG) | Test the packaged app |
| `yarn packmac` | Compile + package macOS .dmg (unsigned) | Full macOS build |
| `npx tsc --noEmit` | Type-check only (no output) | Verify TypeScript is happy |

### How to Open DevTools

In the running app: **View > Toggle Developer Tools** or press `Cmd+Option+I`

This opens Chromium DevTools in the renderer process. Essential for debugging i18n, inspecting DOM, and checking console errors.

---

## Part 2: Architecture Quick Reference

```text
┌─────────────────────────────────────────────────────┐
│                    Electron App                      │
│                                                      │
│  ┌─ Main Process ─────────────────────────────────┐  │
│  │  src/main/index.ts (entry)                     │  │
│  │    → init.ts: preloadI18nStrings(),            │  │
│  │               setupI18nHandlers(),             │  │
│  │               setupExifHandlers()              │  │
│  │    → app.whenReady()                           │  │
│  │    → createMainWindow() + setupMainWindow()    │  │
│  │                                                │  │
│  │  Handles: IPC, exiftool process, menus, dock   │  │
│  │  Has: Full Node.js access, file system, spawn  │  │
│  └────────────────────┬───────────────────────────┘  │
│                       │ IPC (8 channels)             │
│  ┌─ Preload ──────────┴──────────────────────────┐   │
│  │  src/preload/index.ts                         │   │
│  │  contextBridge.exposeInMainWorld("api", ...)  │   │
│  │  Exposes: window.api.exif, .i18n, .files      │   │
│  └────────────────────┬──────────────────────────┘   │
│                       │ window.api.*                  │
│  ┌─ Renderer ─────────┴──────────────────────────┐   │
│  │  src/renderer/index.ts (entry)                │   │
│  │    → setupI18n() [async — fetches strings]    │   │
│  │    → setupDragAndDrop()                       │   │
│  │    → setupSelectFilesMenu()                   │   │
│  │                                               │   │
│  │  SANDBOXED: No Node.js, no Electron imports   │   │
│  │  Only access: window.api.* (via preload)      │   │
│  │  Pure DOM manipulation + CSS                  │   │
│  └───────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Dev Mode vs Production

| Aspect | Dev (`yarn dev`) | Production (packaged app) |
|--------|------------------|---------------------------|
| Renderer loads from | `http://localhost:5173/` (Vite HMR) | `file://out/renderer/index.html` |
| Resources path | `process.cwd()/.resources/` | `process.resourcesPath` (inside .app bundle) |
| strings.json | `.resources/strings.json` | Bundled in app resources |
| exiftool binary | `.resources/nix/bin/exiftool` | `Contents/Resources/nix/bin/exiftool` |
| `NODE_ENV` | `undefined` or `"development"` | `"production"` |
| DevTools | Available (View menu) | Available (View menu) |

### Where Resources Live

```text
.resources/                    ← Dev mode reads from here
├── strings.json               ← i18n (30KB, 24 languages)
├── icon.png                   ← App icon
├── check.png                  ← Checkmark icon (for dock overlay on Windows)
├── nix/bin/
│   ├── .keep                  ← Git placeholder (always present)
│   ├── exiftool               ← The actual binary (MUST DOWNLOAD)
│   └── lib/                   ← Perl modules for exiftool (MUST DOWNLOAD)
└── win/bin/
    ├── .keep                  ← Git placeholder
    └── exiftool.exe           ← Windows binary (MUST DOWNLOAD)
```

---

## Part 3: i18n Diagnosis Guide

### The Complete Flow

```text
APP STARTUP
────────────

1. Main Process: init() called
   │
   ├─ preloadI18nStrings()                    [src/common/i18n.ts]
   │   reads .resources/strings.json synchronously
   │   parses JSON, caches in module-scoped `strings` variable
   │
   ├─ setupI18nHandlers()                     [src/main/i18n.ts]
   │   registers IPC handler "get-locale"       → returns app.getLocale()
   │   registers IPC handler "get-i18n-strings" → returns cached strings
   │
   └─ ... other init (exif, menus, dock, etc.)

2. app.whenReady() resolves

3. BrowserWindow created, loads renderer

RENDERER STARTUP
─────────────────

4. src/renderer/index.ts: setup() called
   │
   └─ await setupI18n()                       [src/renderer/i18n.ts]
       │
       ├─ cachedStrings = await window.api.i18n.getStrings()
       │   (IPC round-trip to main → returns full 24-language dictionary)
       │
       └─ await translateHtml()
           │
           ├─ locale = await window.api.i18n.getLocale()
           │   (IPC round-trip to main → returns e.g. "en-US")
           │
           └─ document.querySelectorAll("[i18n]")
              for each element:
                key = element.getAttribute("i18n")
                element.innerText = i18nLookup(strings, key, locale)

              Lookup chain: exact locale → fallback locale → English
              Example: "fr-CA" → try "fr-CA" → try "fr" → try "en"
```

### HTML Elements That Get Translated

| Element | `i18n` attribute | English text |
|---------|-----------------|-------------|
| Empty pane title | `i18n="empty.title"` | "No files selected" |
| Empty pane subtitle | `i18n="empty.subtitle"` | "Drag and drop images, videos, or PDF files to automatically remove metadata." |
| Table header 1 | `i18n="table.header.filename"` | "Filename" |
| Table header 2 | `i18n="table.header.exif-before"` | "EXIF Before" |
| Table header 3 | `i18n="table.header.exif-after"` | "EXIF After" |

### DevTools Debugging Commands

Open DevTools (`Cmd+Option+I`), go to Console tab:

```javascript
// Check if the API bridge is working
window.api
// Should show: {exif: {...}, i18n: {...}, files: {...}}

// Check if strings were loaded
window.api.i18n.getStrings().then(s => console.log(Object.keys(s).length))
// Should show: ~25 (the number of i18n keys)

// Check your locale
window.api.i18n.getLocale().then(l => console.log(l))
// Should show your system locale, e.g. "en-US"

// Check if i18n elements were translated
document.querySelector('[i18n="empty.title"]').innerText
// Should show "No files selected" (or equivalent in your locale)

// Check ALL i18n elements
document.querySelectorAll('[i18n]').forEach(el =>
  console.log(el.getAttribute('i18n'), '→', el.innerText)
)
// Should show 5 key→text pairs, all non-empty
```

### If i18n Is Broken: Diagnosis Checklist

1. **Check Console for errors** — look for `"Could not find localization strings for: ..."` or `"i18n strings not loaded"`
2. **Check strings.json exists**: `ls -la .resources/strings.json` — should be ~30KB
3. **Check you're running from project root**: `pwd` should be `/Users/jon/projects/exifcleaner` — resource path resolution depends on `process.cwd()`
4. **Check the IPC bridge**: type `window.api` in DevTools console — if `undefined`, the preload script failed to load
5. **Check preload path**: in `src/main/window_setup.ts` line 61, the preload is at `../preload/index.mjs` relative to `out/main/`

---

## Part 4: Manual Test Plan

### Test Files to Prepare

Before testing, gather these test files:

| File type | Where to get one | What to test |
|-----------|-----------------|--------------|
| JPEG with EXIF | Any photo from your phone camera | Core workflow |
| PNG (no EXIF) | Screenshot (`Cmd+Shift+4`) | Graceful handling of no metadata |
| PDF | Any PDF document | PDF metadata removal |
| MP4 video | Any video from your phone | Video metadata |
| File with long name | Rename a file to 60+ characters | Filename truncation + tooltip |

---

### A. App Launch

| # | Test | Expected Result | Pass? |
|---|------|----------------|-------|
| A1 | Run `yarn dev` | Window opens, no console errors | ☐ |
| A2 | Empty state visible | Large icon + "No files selected" + subtitle text visible | ☐ |
| A3 | i18n strings loaded | All 5 i18n elements have text (not empty) | ☐ |
| A4 | Table is hidden | File list table should NOT be visible on launch | ☐ |
| A5 | Window title | Title bar shows "ExifCleaner" | ☐ |
| A6 | Window size | Window is ~580x337px, has minimum size constraint | ☐ |
| A7 | No console errors | DevTools Console tab shows no red errors | ☐ |

---

### B. Drag & Drop

| # | Test | Expected Result | Pass? |
|---|------|----------------|-------|
| B1 | Drag JPEG onto window | Empty pane disappears, table appears, row added with filename | ☐ |
| B2 | "Before" column | Shows EXIF count > 0, spinner disappears | ☐ |
| B3 | Hover "Before" count | Popover shows all EXIF tags as key-value pairs | ☐ |
| B4 | Processing spinner | Spinner appears in "After" column during processing | ☐ |
| B5 | "After" column | After processing: count shows 0 (or very few remaining tags) | ☐ |
| B6 | Hover "After" count | Popover shows remaining tags (if any) | ☐ |
| B7 | File was actually cleaned | Open the original file in Preview > Tools > Show Inspector — EXIF should be gone | ☐ |
| B8 | Drag PNG (no EXIF) | Row shows "0" for both before and after | ☐ |
| B9 | Drag PDF | Processes successfully, metadata removed | ☐ |
| B10 | Drag MP4 | Processes successfully, metadata removed | ☐ |
| B11 | Drag 5+ files at once | All rows appear, all process, progress updates smoothly | ☐ |
| B12 | Drag second batch | Previous rows cleared, new files shown | ☐ |
| B13 | Long filename | Filename truncated with ellipsis, full path in hover tooltip | ☐ |

**WARNING**: ExifCleaner **modifies files in place** — it overwrites the original. Use copies of your test files, not originals you care about.

---

### C. File > Open Dialog

| # | Test | Expected Result | Pass? |
|---|------|----------------|-------|
| C1 | Click File > Open | Native macOS file picker opens | ☐ |
| C2 | Press `Cmd+O` | Same — file picker opens | ☐ |
| C3 | Select one file | File picker closes, file processes (same as drag) | ☐ |
| C4 | Select multiple files | All files process in parallel | ☐ |
| C5 | Cancel file picker | Nothing happens, app returns to previous state | ☐ |

---

### D. EXIF Display Details

| # | Test | Expected Result | Pass? |
|---|------|----------------|-------|
| D1 | EXIF count accuracy | Count matches number of tags shown in popover | ☐ |
| D2 | Popover position | Popover appears below the count, doesn't overflow window | ☐ |
| D3 | Popover dismiss | Moving mouse away from count closes popover | ☐ |
| D4 | Tag values sanitized | No HTML renders in tag values (test with a file that has `<script>` in EXIF — unlikely but verify text-only rendering) | ☐ |
| D5 | Non-string values skipped | Tags with non-string values don't appear in popover (by design) | ☐ |

---

### E. Processing States

| # | Test | Expected Result | Pass? |
|---|------|----------------|-------|
| E1 | Initial spinner | When row first appears, "Before" column shows spinner | ☐ |
| E2 | Before → After transition | After EXIF read, "Before" shows count; spinner moves to "After" | ☐ |
| E3 | Processing complete | "After" column shows count, spinner gone | ☐ |
| E4 | All files done notification | Main process receives `all-files-processed` event | ☐ |

---

### F. Menu Bar

| # | Test | Expected Result | Pass? |
|---|------|----------------|-------|
| F1 | ExifCleaner menu exists | App menu shows "ExifCleaner" as first menu (Mac) | ☐ |
| F2 | About ExifCleaner | Shows dialog with app name, version "3.6.0", copyright "© szTheory" | ☐ |
| F3 | File > Open | Opens file picker (same as C1) | ☐ |
| F4 | Edit > Copy | Copies selected text (if any EXIF text selected) | ☐ |
| F5 | Edit > Select All | Selects all text in window | ☐ |
| F6 | View > Toggle DevTools | Opens/closes DevTools panel | ☐ |
| F7 | View > Reset Zoom | Resets to 100% zoom | ☐ |
| F8 | View > Zoom In/Out | `Cmd+=` zooms in, `Cmd+-` zooms out | ☐ |
| F9 | View > Toggle Full Screen | Enters/exits full screen | ☐ |
| F10 | Window > Minimize | Minimizes to dock | ☐ |
| F11 | Help > Website | Opens `https://exifcleaner.com` in browser | ☐ |
| F12 | Help > Source Code | Opens `https://github.com/szTheory/exifcleaner` in browser | ☐ |
| F13 | Help > Report Issue | Opens GitHub new issue with debug info (app version, Electron version, OS, locale) | ☐ |
| F14 | Dock right-click | Shows "Open..." option | ☐ |

---

### G. Context Menu

| # | Test | Expected Result | Pass? |
|---|------|----------------|-------|
| G1 | Right-click on EXIF text in popover | Context menu with Copy + Select All | ☐ |
| G2 | Right-click on empty space | Only "Select All" (no Copy when nothing selected) | ☐ |
| G3 | Copy from context menu | Copies selected EXIF text to clipboard | ☐ |

---

### H. Dock Behavior (macOS)

| # | Test | Expected Result | Pass? |
|---|------|----------------|-------|
| H1 | Drop files, watch dock | Dock badge shows remaining file count | ☐ |
| H2 | As files process | Badge count decreases | ☐ |
| H3 | All done (app focused) | Badge disappears | ☐ |
| H4 | All done (app NOT focused) | Dock icon bounces | ☐ |
| H5 | Close window | App stays in dock (Mac convention) | ☐ |
| H6 | Click dock icon after close | Window reopens | ☐ |

---

### I. Dark Mode

| # | Test | Expected Result | Pass? |
|---|------|----------------|-------|
| I1 | System set to Light | App has light background (#F5F6F8), dark text | ☐ |
| I2 | System set to Dark | App has dark background (#121212), light text | ☐ |
| I3 | Switch while app is running | App switches appearance instantly (CSS media query) | ☐ |
| I4 | Dark: empty pane | Icon, title, subtitle all visible and readable | ☐ |
| I5 | Dark: table | Table rows visible, alternating row colors work | ☐ |
| I6 | Dark: popover | EXIF popover card visible with correct contrast | ☐ |
| I7 | Dark: hover states | Table row hover highlight visible | ☐ |

To toggle: **System Settings > Appearance > Light/Dark**

---

### J. Packaged App

| # | Test | Expected Result | Pass? |
|---|------|----------------|-------|
| J1 | Build: `yarn packmactest` | Completes without errors, creates `dist/mac-arm64/` | ☐ |
| J2 | Locate app | `dist/mac-arm64/ExifCleaner.app` exists | ☐ |
| J3 | Launch app | Double-click .app → window opens with i18n strings | ☐ |
| J4 | Drag file to packaged app | File processes, EXIF removed | ☐ |
| J5 | Menu bar works | All menus present and functional | ☐ |
| J6 | About shows correct version | Help or app menu > About shows 3.6.0 | ☐ |

---

## Part 5: Cleanup Tasks

These are zero-risk removals of dead code discovered during exploration.

### Remove `source-map-support`

**Why**: Listed as a production dependency but **never imported anywhere** in the entire `src/` directory. Zero references. Modern Node 22 (which Electron 35 ships) has built-in `--enable-source-maps` — this package is obsolete.

**Change**: Remove from `package.json` dependencies:

```json
// BEFORE
"dependencies": {
    "node-exiftool": "2.3.0",
    "source-map-support": "^0.5"
}

// AFTER
"dependencies": {
    "node-exiftool": "2.3.0"
}
```

Then run `yarn install` to update lockfile.

### Delete `.travis.yml`

**Why**: Tests Node 14/16 (we need 20+), runs only lint + tsc, macOS disabled. Travis CI is not used. Will be replaced by GitHub Actions in Phase 9.

**Change**: `rm .travis.yml`

### Verify After Cleanup

```bash
npx tsc --noEmit     # Zero errors
yarn compile         # Builds succeed
yarn dev             # App launches
yarn packmactest     # Packaging works
```

---

## Part 6: Known Issues & Gotchas

### Exiftool Binary Must Be Downloaded

The git repo does NOT include the exiftool binary — only `.keep` placeholder files. You must run `./update_exiftool.pl` once after cloning. The script requires Perl, curl, wget, and tar (all pre-installed on macOS).

If you skip this step, the app will launch fine but **crash when you try to process a file** — the error will be a spawn failure from `node-exiftool` trying to execute a non-existent binary.

### `ELECTRON_RUN_AS_NODE=` Prefix in Scripts

The `yarn dev` and `yarn start` scripts have `ELECTRON_RUN_AS_NODE=` (set to empty string) as a prefix. This prevents VS Code / Cursor from setting `ELECTRON_RUN_AS_NODE=1` in the environment, which would cause Electron to act as a plain Node.js process instead of a GUI app.

### Must Run From Project Root

Dev mode resolves resources via `process.cwd()/.resources/`. If you run `yarn dev` from a different directory, the app won't find `strings.json` or the exiftool binary.

### Single Instance Lock

`app.requestSingleInstanceLock()` prevents running two copies of ExifCleaner. If you try to launch a second instance, it will quit immediately and focus the first one. This means you can't compare dev vs production side by side.

### Mac: Window Close ≠ App Quit

On macOS, closing the window (`Cmd+W`) does NOT quit the app — it stays in the dock (standard Mac convention). Click the dock icon to get the window back, or `Cmd+Q` to actually quit.

### Exiftool Spawns Lazily

The exiftool process is NOT spawned when the app launches. It's created on the **first IPC call** to `exif:read` or `exif:remove` (see `getProcess()` in `src/main/exif_handlers.ts`). This means the app startup is fast, but the first file you process has a small additional delay for process spawn.

### Files Are Modified In Place

ExifCleaner overwrites the original file with the cleaned version. There is no "save as copy" option yet (that's Phase 7). **Always use copies of files you care about when testing.**

### exiftool Is a Perl Script, Not a Native Binary

The "exiftool binary" at `.resources/nix/bin/exiftool` is actually a Perl script (~25KB). It requires Perl to be installed on the system (pre-installed on macOS). The `lib/` directory next to it contains the Perl modules it depends on. The Windows version (`.exe`) is a self-contained executable that bundles Perl.

### Architecture-Specific Note (Apple Silicon)

ExifTool is a Perl script, so it's architecture-independent — works the same on Intel and Apple Silicon Macs. The Electron binary itself runs natively on ARM64 (Electron 35 supports Apple Silicon). No Rosetta translation needed for development.

---

## Part 7: After Verification

Once all tests pass and cleanup is done, the deliverables are:

1. `devplans/05-verify-cleanup.md` — this document (committed to repo)
2. `package.json` — `source-map-support` removed from dependencies
3. `.travis.yml` — deleted
4. `CLAUDE.md` — updated (remove source-map-support from deps table, remove .travis.yml reference, update current state)
5. Commit (do NOT push)

*Done when: manual QA passes, cleanup committed, the app is confirmed working end-to-end on Apple Silicon Mac in both dev mode and packaged mode.*
