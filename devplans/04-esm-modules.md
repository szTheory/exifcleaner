# Chunk 4: ESM Module Hygiene

**Prerequisite**: Chunk 1 (electron-vite) ✅, Chunk 2 (TypeScript 5.7 strict) ✅, Chunk 3 (Electron 35 + contextIsolation) ✅
**Blocks**: Chunk 5 (ExifTool update), Chunk 6 (dep cleanup — ESM-only packages become usable)

---

## Why This Chunk Exists

The source code is already ESM — every file uses `import`/`export`, there are zero `require()` calls and zero `module.exports`. But two things are wrong:

1. **TypeScript doesn't enforce type/value import separation.** Without `verbatimModuleSyntax`, TypeScript silently elides type-only imports at compile time. This works, but means `import { BrowserWindow }` compiles to `const { BrowserWindow } = require("electron")` even when `BrowserWindow` is only used as a type annotation. This wastes runtime work and obscures intent.

2. **Build output for main and preload is CommonJS.** electron-vite defaults to CJS output for main/preload targets. The renderer already outputs ESM (`format: "es"`), but main and preload produce `require()` calls.

```
SOURCE (all ESM already)          BUILD OUTPUT (mixed)
────────────────────              ────────────────────
src/main/*.ts     import/export   out/main/index.js      require() ← CJS
src/preload/*.ts  import/export   out/preload/index.js   require() ← CJS
src/renderer/*.ts import/export   out/renderer/assets/*  import    ← ESM ✓
```

Neither issue is a runtime bug — the app works. But they're tech debt that blocks future work: ESM-only npm packages won't load in CJS output, and sloppy imports make the codebase harder to reason about.

---

## The Surprise: Almost Nothing to Do

This is one of the smallest chunks in the modernization. The hard work (converting to `import`/`export` syntax) was already done by TypeScript + electron-vite in prior chunks. What remains:

- **15 files** need `import type` or inline `type` keyword added to imports
- **1 file** (`tsconfig.json`) needs `verbatimModuleSyntax: true`
- **1 file** (`package.json`) needs `"type": "module"`

No logic changes. No new files. No deleted files. No architecture changes. Pure module hygiene.

---

## Import Audit

Precise analysis of every `import` from `"electron"` across the codebase. The `verbatimModuleSyntax` compiler option requires that type-only imports are explicitly marked.

### Pure Type Imports (5 files)

These files import `MenuItemConstructorOptions` but only use it as a TypeScript type annotation — never as a runtime value. They need `import type`.

| File | Current | After |
|------|---------|-------|
| `src/main/menu_dock.ts` | `import { MenuItemConstructorOptions }` | `import type { MenuItemConstructorOptions }` |
| `src/main/menu_edit.ts` | `import { MenuItemConstructorOptions }` | `import type { MenuItemConstructorOptions }` |
| `src/main/menu_file.ts` | `import { MenuItemConstructorOptions }` | `import type { MenuItemConstructorOptions }` |
| `src/main/menu_view.ts` | `import { MenuItemConstructorOptions }` | `import type { MenuItemConstructorOptions }` |
| `src/main/menu_window.ts` | `import { MenuItemConstructorOptions }` | `import type { MenuItemConstructorOptions }` |

### Mixed Imports (10 files)

These files import both runtime values (used in executable code) and types (used only in annotations). They need the inline `type` keyword syntax: `import { value, type TypeName }`.

| File | Values (runtime) | Types (annotation-only) |
|------|------------------|------------------------|
| `src/main/menu.ts` | `app`, `Menu` | `MenuItemConstructorOptions` |
| `src/main/menu_app.ts` | `app` | `MenuItemConstructorOptions` |
| `src/main/menu_help.ts` | `shell`, `app` | `MenuItemConstructorOptions` |
| `src/main/menu_item_open_url.ts` | `shell` | `MenuItemConstructorOptions` |
| `src/main/index.ts` | `app` | `BrowserWindow` |
| `src/main/init.ts` | `app` | `BrowserWindow` |
| `src/main/app_setup.ts` | `app` | `BrowserWindow` |
| `src/main/file_open.ts` | `dialog` | `BrowserWindow` |
| `src/main/dock.ts` | `app`, `ipcMain`, `nativeImage` | `BrowserWindow` |
| `src/main/menu_file_open.ts` | (from `file_open.ts`) | `BaseWindow`, `MenuItemConstructorOptions`, `MenuItem`, `KeyboardEvent` |

### Value-Only Imports (6 files — no changes needed)

These files import names that are all used as runtime values:

| File | Imports | Why they're values |
|------|---------|-------------------|
| `src/main/menu_app_about.ts` | `app` | `app.name`, `app.getVersion()` |
| `src/main/context_menu.ts` | `app`, `Menu`, `MenuItem` | All constructed/called at runtime |
| `src/main/i18n.ts` | `app`, `ipcMain` | `app.getLocale()`, `ipcMain.handle()` |
| `src/main/exif_handlers.ts` | `ipcMain` | `ipcMain.handle()` |
| `src/main/window_setup.ts` | `BrowserWindow`, `app` | `new BrowserWindow()`, `app.name` |
| `src/common/browser_window.ts` | `BrowserWindow` | `BrowserWindow.getAllWindows()` |

### Already Correct (4 files)

These files already use `import type`:

| File | Import |
|------|--------|
| `src/preload/index.ts` | `import type { ElectronApi } from "./api_types"` |
| `src/preload/api_types.ts` | `import type { I18nStringsDictionary }` |
| `src/renderer/i18n.ts` | `import { i18nLookup, type I18nStringsDictionary }` |
| `src/renderer/env.d.ts` | `import type { ElectronApi }` |

---

## Design Decisions

### Inline `type` keyword (not separate import statements)

```typescript
// YES — single import, clean:
import { app, Menu, type MenuItemConstructorOptions } from "electron";

// NO — redundant duplication:
import { app, Menu } from "electron";
import type { MenuItemConstructorOptions } from "electron";
```

The inline syntax keeps all imports from the same module together. Less visual noise, easier to scan.

### Keep `esModuleInterop: true`

With `module: "ESNext"`, it has no effect on emitted code (electron-vite/esbuild handles emit). But removing it would force changing `import fs from "fs"` to `import * as fs from "fs"` everywhere — churn for zero benefit.

### `__dirname` in ESM output

electron-vite automatically polyfills `__dirname` and `__filename` when outputting ESM for main/preload. The 2 usages in `window_setup.ts` need no source changes.

---

## Phase A: Enable `verbatimModuleSyntax` + Fix Type Imports

### Step A1: Add compiler option

**tsconfig.json**: Add `"verbatimModuleSyntax": true`.

This tells TypeScript: "emit my import/export statements exactly as written — if something is type-only, I must mark it with `import type` or the inline `type` keyword."

### Step A2: Fix all type errors

Run `npx tsc --noEmit`. Expect ~15 errors of the form:

```
error TS1484: 'MenuItemConstructorOptions' is a type and must be imported using a type-only import
```

Fix the 5 pure-type files and 10 mixed-import files from the audit above.

### Step A3: Verify

```bash
npx tsc --noEmit    # Zero errors
yarn compile        # Builds succeed (output still CJS — that's fine)
yarn dev            # App launches and works
```

---

## Phase B: Switch to ESM Output

### Step B1: Add `"type": "module"` to package.json

This signals to Node.js (and electron-vite) that the package is ESM. electron-vite will automatically switch main/preload output from CJS to ESM.

### Step B2: Verify ESM output

```bash
yarn compile
# Inspect out/main/index.js — should contain `import` not `require`
# Inspect out/preload/index.js — same
```

### Step B3: Full verification

```bash
npx tsc --noEmit    # Zero errors
yarn compile        # Builds succeed
yarn dev            # App launches, full drag-and-drop workflow works
yarn packmactest    # Packaging works with ESM entry point
```

---

## Files Modified

| File | Change | Phase |
|------|--------|-------|
| `tsconfig.json` | Add `verbatimModuleSyntax: true` | A |
| 5 menu files | `import type { MenuItemConstructorOptions }` | A |
| 10 main files | Add inline `type` keyword to type-only names | A |
| `package.json` | Add `"type": "module"` | B |

**Total**: 17 file edits. No new files. No deleted files. No logic changes.

---

## Gotchas

| Issue | Risk | Mitigation |
|-------|------|------------|
| **`verbatimModuleSyntax` + `esModuleInterop`** | The two options have a known tension — `esModuleInterop` implies CJS interop helpers that `verbatimModuleSyntax` disallows. | With `module: "ESNext"`, `esModuleInterop` is a no-op — no helpers emitted. Should be compatible. If not, remove `esModuleInterop` and `allowSyntheticDefaultImports` and fix any resulting `import * as` issues. |
| **`__dirname` in ESM** | ESM doesn't have `__dirname` or `__filename`. | electron-vite polyfills them automatically when targeting ESM. Zero source changes needed. |
| **electron-vite ESM main entry** | May change output filename from `.js` to `.mjs` | Check that `package.json` `"main"` field still points to the correct file. |
| **`node-exiftool` in ESM** | Old CJS package imported with `import { ExiftoolProcess }` | `esModuleInterop` + bundler handles this. electron-vite's rollup config externalizes nothing in main, so it bundles the CJS module. |
| **electron-builder with ESM** | Builder needs to find the correct entry point | Verify `yarn packmactest` finds `out/main/index.js` |

---

## Verification Checklist

### Phase A (verbatimModuleSyntax)
- [ ] `npx tsc --noEmit` — zero errors
- [ ] `yarn compile` — builds succeed
- [ ] `yarn dev` — app launches, UI works, EXIF cleaning works
- [ ] No `import { SomeType }` without `type` keyword for type-only imports (grep verification)

### Phase B (ESM output)
- [ ] `npx tsc --noEmit` — zero errors
- [ ] `yarn compile` — builds succeed
- [ ] `out/main/index.js` contains `import` not `require()`
- [ ] `out/preload/index.js` contains `import` not `require()`
- [ ] `yarn dev` — app launches, full drag-and-drop workflow works
- [ ] `yarn packmactest` — packaging works with ESM entry point
- [ ] Packaged app works end-to-end

---

## What's Left After This

```
✅ Chunk 1 — build system (electron-vite)
✅ Chunk 2 — TypeScript 5.7 strict + Prettier 3.x
✅ Chunk 3 — Electron 35 + contextIsolation + preload
✅ Chunk 4 (this) — ESM modules
   └─→ Chunk 5 — ExifTool binary update
        └─→ Chunk 6 — Kill dependencies (hand-roll exiftool, remove source-map-support)
```

After this chunk, the codebase is fully ESM from source to output. Modern ESM-only packages can be used. The module system is clean and explicit.

---

*Done when: `verbatimModuleSyntax: true` compiles cleanly, `"type": "module"` is set, build output is ESM, all verification checks pass.*
