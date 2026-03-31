# Electron Best Practices for ExifCleaner

**Purpose**: Codified Electron security, performance, and UX patterns for building a secure, fast, and polished cross-platform desktop app.

**Audience**: LLMs building/refactoring ExifCleaner + humans reviewing code.

**Format**: Imperative voice, scannable, actionable patterns with inline examples.

**Last updated**: February 15, 2026

---

## Table of Contents

1. [Quick Reference Checklists](#quick-reference-checklists)
2. [Security Baseline](#security-baseline)
3. [IPC Design Patterns](#ipc-design-patterns)
4. [Native Feel & Polish](#native-feel--polish)
5. [Performance Optimization](#performance-optimization)
6. [Build & Packaging](#build--packaging)
7. [ExifCleaner Implementation Status](#exifcleaner-implementation-status)
8. [Quick Wins](#quick-wins)
9. [LLM Project Rules](#llm-project-rules)

---

## Quick Reference Checklists

### Security Checklist

Use this checklist for all BrowserWindow configurations:

- ✅ `contextIsolation: true` — Isolates preload from renderer
- ✅ `sandbox: true` — Renderer has no Node.js access
- ✅ `nodeIntegration: false` — Explicitly disable Node in renderer
- ✅ `enableRemoteModule: false` — Disable deprecated remote module
- ✅ `devTools: false` in production — No debug tools in release builds
- ✅ Preload script with `contextBridge` — Only way to expose APIs
- ✅ Navigation hardening — Block untrusted origins
- ✅ Window open handler — Deny popups, validate external URLs
- ✅ Permission handler — Deny by default, allowlist specific origins
- ✅ IPC sender validation — Verify `event.sender.id` in main
- ✅ IPC payload validation — Schema validation (zod, valibot) for all inputs
- ✅ No production debug flags — Never ship with `--no-sandbox`, `--remote-debugging-port`

### Performance Checklist

- ✅ `show: false` → `ready-to-show` — No white flash on launch
- ✅ Lazy imports in main — Defer heavy modules until needed
- ✅ No sync I/O on startup — `readFileSync` blocks the event loop
- ✅ UtilityProcess for heavy work — CPU-intensive tasks off main thread
- ✅ Startup time budget — Measure cold start, enforce < 2s
- ✅ Memory profiling — Use Chrome DevTools to find leaks
- ✅ Background throttling — Only disable for real-time use cases

### Native Feel Checklist

- ✅ Platform menus — Native menu bar with standard roles
- ✅ System theme — Respect `nativeTheme`, follow `prefers-color-scheme`
- ✅ Keyboard shortcuts — Platform-specific (Cmd on Mac, Ctrl on Win/Linux)
- ✅ Window persistence — Save/restore size, position, state
- ✅ Single instance lock — Prevent duplicate app launches
- ✅ Native dialogs — Use `dialog.showOpenDialog` for file picking
- ✅ External links — Open in system browser via `shell.openExternal`
- ✅ Accessibility — Semantic HTML, ARIA, keyboard navigation
- ✅ System fonts — Use `system-ui` font stack, no custom fonts

---

## Security Baseline

### Non-Negotiables

**ALWAYS enforce these security defaults. Never ship code that violates them.**

1. **Treat renderer as hostile** — Renderer must not have Node.js access
2. **Preload is the only bridge** — Expose minimal, typed API surface
3. **Main process stays boring** — No heavy/unsafe work in main, use UtilityProcess
4. **Keep Electron current** — Security patches require staying up to date
5. **Every power feature needs a policy** — Navigation, file access, clipboard, deep links must have explicit allowlists

### BrowserWindow: Secure Defaults

**ALWAYS use this configuration. Never change security defaults without explicit justification.**

```typescript
// src/main/windows/createMainWindow.ts
import path from 'node:path';
import { BrowserWindow } from 'electron';

export function createMainWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 740,
    show: false, // Prevent white flash; show on ready-to-show
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),

      // ✅ Security baseline — NEVER change these in production
      contextIsolation: true,  // Isolates preload from renderer
      sandbox: true,           // Renderer has no Node.js access
      nodeIntegration: false,  // Explicitly disable Node in renderer

      // Good hygiene
      devTools: process.env.NODE_ENV === 'development', // No DevTools in production
    },
  });

  // Show window gracefully to avoid white flash
  win.once('ready-to-show', () => win.show());

  return win;
}
```

**Rationale**:
- `contextIsolation: true` — Preload runs in isolated world, cannot access renderer globals
- `sandbox: true` — Renderer has no Node.js, no native modules, no `require()`
- `nodeIntegration: false` — Defense in depth (redundant with sandbox but explicit)
- `show: false` + `ready-to-show` — Prevents white flash during startup (UX + performance)

**ExifCleaner status**: ✅ Implemented in `src/main/window_setup.ts` as of Phase 3 (Electron 35 upgrade).

### Navigation Hardening

**ALWAYS block untrusted navigation. Renderer should only navigate within your app.**

```typescript
// src/main/security/navigation.ts
import { shell } from 'electron';
import type { BrowserWindow } from 'electron';

const ALLOWED_ORIGINS = new Set([
  'app://-', // Custom protocol for local app content
  // Add trusted domains if you load remote content:
  // 'https://your-trusted-domain.example',
]);

export function hardenNavigation(win: BrowserWindow) {
  // Block top-level navigation to untrusted origins
  win.webContents.on('will-navigate', (event, url) => {
    const origin = new URL(url).origin;
    if (!ALLOWED_ORIGINS.has(origin)) {
      console.warn(`[security] Blocked navigation to untrusted origin: ${origin}`);
      event.preventDefault();
    }
  });

  // Block new windows; open external links in system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      // Only allow HTTPS links to open in system browser
      if (u.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch {
      // Invalid URL, ignore
    }
    return { action: 'deny' }; // Never allow renderer to open new windows
  });
}
```

**Important**: Never pass **user-controlled** URLs directly to `shell.openExternal`. Always validate protocol and origin first.

**ExifCleaner status**: ❌ Not implemented. Quick Win #1 (15 min, high security impact).

### Permission Gate (Deny by Default)

**ALWAYS deny all permissions unless explicitly allowed.**

```typescript
// src/main/security/permissions.ts
import { session } from 'electron';

const ALLOW = {
  // Example: allow notifications only for trusted origin
  notifications: new Set(['https://your-trusted-domain.example']),
};

export function installPermissionGate() {
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    const origin = (() => {
      try {
        return new URL(wc.getURL()).origin;
      } catch {
        return 'null';
      }
    })();

    if (permission === 'notifications') {
      return callback(ALLOW.notifications.has(origin));
    }

    // Deny everything else unless explicitly allowed
    console.warn(`[security] Denied permission request: ${permission} from ${origin}`);
    return callback(false);
  });
}
```

**ExifCleaner status**: ❌ Not implemented. ExifCleaner loads only local content (`file://`), but this is defense in depth. Quick Win #2 (10 min, medium security impact).

### Content Security Policy (CSP)

**For local app content, use a strict CSP. Start strict, loosen only if needed.**

```html
<!-- src/renderer/index.html -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'none';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  connect-src 'self';
  base-uri 'none';
  frame-ancestors 'none';
">
```

**Explanation**:
- `default-src 'none'` — Deny everything by default
- `script-src 'self'` — Only load scripts from app bundle
- `style-src 'self' 'unsafe-inline'` — Allow inline styles (try to avoid if possible)
- `img-src 'self' data:` — Allow images from app + data URIs
- `connect-src 'self'` — No remote API calls (ExifCleaner has zero network traffic)
- `base-uri 'none'` — Prevent `<base>` tag attacks
- `frame-ancestors 'none'` — Prevent clickjacking

**Rule**: No `eval`, no remote scripts, no wildcard origins.

**ExifCleaner status**: ❌ Not implemented. Quick Win #3 (5 min, high security impact).

### Safe Secrets at Rest

**Use OS-backed crypto for secrets. Never store plaintext tokens.**

```typescript
// src/main/secrets/secureStore.ts
import { safeStorage } from 'electron';
import Store from 'electron-store';

const store = new Store<{ token?: string }>({ name: 'secrets' });

export function saveToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this OS/user session');
  }
  const encrypted = safeStorage.encryptString(token);
  store.set('token', encrypted.toString('base64'));
}

export function loadToken(): string | null {
  const b64 = store.get('token');
  if (!b64) return null;
  const buf = Buffer.from(b64, 'base64');
  return safeStorage.decryptString(buf);
}
```

**ExifCleaner status**: N/A (no secrets stored). Keep pattern available for future auth features.

### Electron Fuses (Reduce Attack Surface)

**Disable unused Electron features to reduce binary attack surface.**

Fuses let you disable internal knobs at build time (e.g., `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`).

**Recommended fuses for production**:
- Disable `runAsNode` — Prevents LOLBin-style abuse
- Disable `nodeOptions` — Prevents `NODE_OPTIONS` environment injection
- Disable `nodeCliInspect` — Prevents `--inspect` flag

**ExifCleaner status**: ❌ Not implemented. Track in Phase 12 (Apple Silicon + Code Signing).

---

## IPC Design Patterns

### IPC Principles

**Follow these principles for ALL IPC communication:**

1. **Prefer `invoke/handle` over `send/on`** — Request-response is clearer than events
2. **Allowlist channels in preload** — Never expose raw `ipcRenderer`
3. **Validate sender in main** — Ensure IPC comes from authorized window
4. **Validate payloads in main** — Use schema validation (zod, valibot) for all inputs
5. **Main is the policy boundary** — Renderer requests, main decides

### Define a Typed Contract Once

**Create a single source of truth for all IPC channels.**

```typescript
// src/types/ipc.ts
export type IpcChannels = {
  // Format: { req: RequestType; res: ResponseType }
  'app:getVersion': { req: void; res: { version: string } };
  'exif:read': { req: { path: string }; res: { metadata: Record<string, unknown> } };
  'exif:remove': { req: { path: string }; res: { success: boolean; error?: string } };
  'fs:pickFile': {
    req: { filters?: { name: string; extensions: string[] }[] };
    res: { path: string } | null;
  };
  'i18n:getLocale': { req: void; res: { locale: string } };
  'i18n:getStrings': { req: void; res: Record<string, string> };
};
```

**Benefits**:
- Type safety across main ↔ preload ↔ renderer
- Single place to see all IPC channels
- Easy to audit what renderer can access

**ExifCleaner status**: ❌ Not typed. Current IPC uses string channels without type contract. Quick Win #4 (30 min, high maintainability impact).

### Preload: Expose a Tiny, Typed API

**Never expose raw `ipcRenderer`. Always use `contextBridge` with typed wrapper.**

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcChannels } from '../types/ipc';

type Invoke = <K extends keyof IpcChannels>(
  channel: K,
  req: IpcChannels[K]['req']
) => Promise<IpcChannels[K]['res']>;

const invoke: Invoke = (channel, req) => ipcRenderer.invoke(channel as string, req);

// Expose ONLY this typed invoke function
contextBridge.exposeInMainWorld('api', {
  invoke,

  // Legacy APIs can be wrapped:
  exif: {
    readMetadata: (path: string) => invoke('exif:read', { path }),
    removeMetadata: (path: string) => invoke('exif:remove', { path }),
  },
  i18n: {
    getLocale: () => invoke('i18n:getLocale', undefined),
    getStrings: () => invoke('i18n:getStrings', undefined),
  },
  files: {
    // Fire-and-forget events (send, not invoke)
    notifyAdded: (count: number) => ipcRenderer.send('files-added', count),
    notifyProcessed: () => ipcRenderer.send('file-processed'),
    notifyAllProcessed: () => ipcRenderer.send('all-files-processed'),
  },
});
```

**Renderer usage**:

```typescript
// src/renderer/app.ts
const metadata = await window.api.exif.readMetadata('/path/to/image.jpg');
console.log(metadata);
```

**ExifCleaner status**: ✅ Partial. Uses `contextBridge` with namespaced API (`window.api.exif`, `window.api.i18n`, `window.api.files`). Not typed with contract yet.

### Main: Validate Sender + Validate Payloads

**Treat renderer input as untrusted. Always validate sender and payload.**

```typescript
// src/main/ipc/registerIpc.ts
import { ipcMain, app } from 'electron';
import { z } from 'zod';

// Track allowed WebContents IDs (fill when creating windows)
const allowedWebContents = new Set<number>();

export function registerAllowedWindow(webContentsId: number): void {
  allowedWebContents.add(webContentsId);
}

export function registerIpc(): void {
  // Simple handler with sender validation
  ipcMain.handle('app:getVersion', (event) => {
    if (!allowedWebContents.has(event.sender.id)) {
      throw new Error('Unauthorized sender');
    }
    return { version: app.getVersion() };
  });

  // Handler with payload validation
  const readReqSchema = z.object({
    path: z.string().min(1),
  });

  ipcMain.handle('exif:read', async (event, req) => {
    // 1. Validate sender
    if (!allowedWebContents.has(event.sender.id)) {
      throw new Error('Unauthorized sender');
    }

    // 2. Validate payload
    const { path } = readReqSchema.parse(req);

    // 3. Implement policy (e.g., only allow reading from user's home dir)
    if (!isPathAllowed(path)) {
      throw new Error('Access denied');
    }

    // 4. Execute operation
    const metadata = await readExif(path);
    return { metadata };
  });
}

function isPathAllowed(path: string): boolean {
  // Example: only allow paths in user's home directory
  const userHome = require('os').homedir();
  return path.startsWith(userHome);
}
```

**Important**: Never trust renderer input. Always validate:
1. Sender ID (is this window authorized?)
2. Payload schema (is data well-formed?)
3. Policy constraints (is this operation allowed?)

**ExifCleaner status**: ❌ Partial. Current IPC handlers do not validate sender or payloads. Quick Win #4 (add sender validation: 15 min, add payload schemas: 30 min).

### Never Expose Raw Primitives That Enable RCE

**Never expose these APIs to renderer without strict constraints:**

❌ **Forbidden patterns**:
```typescript
// NEVER expose these to renderer:
api.exec(command)           // Arbitrary command execution
api.openPath(anyPath)       // Arbitrary file system access
api.readFile(anyPath)       // Arbitrary file reading
api.writeFile(anyPath)      // Arbitrary file writing
api.eval(code)              // Code execution
api.executeJavaScript(code) // Code injection
```

✅ **Safe patterns**:
```typescript
// Instead, expose constrained APIs:
api.pickFile()              // User-initiated file picker (safe)
api.readUserFile(path)      // Only reads paths from picker (safe)
api.saveToDownloads(data)   // Only writes to known directory (safe)
api.openExternal(url)       // Only opens HTTPS URLs after validation (safe)
```

**Rule**: Expose **capabilities**, not **primitives**. Let main enforce policy.

**ExifCleaner status**: ✅ Compliant. Current API only exposes `exif:read` and `exif:remove` for user-selected files.

---

## Native Feel & Polish

### Show Window Gracefully (No White Flash)

**Always use `show: false` + `ready-to-show` to prevent white flash.**

```typescript
// src/main/windows/createMainWindow.ts
import { BrowserWindow } from 'electron';

export function createMainWindow() {
  const win = new BrowserWindow({
    show: false, // Don't show until ready
    backgroundColor: '#1e1e1e', // Match app background (optional)
    webPreferences: { /* ... */ },
  });

  // Load content
  win.loadURL(APP_URL);

  // Show window once content is ready
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  return win;
}
```

**Benefits**:
- No white flash during startup (better UX)
- Faster perceived startup (window appears with content)
- Professional feel (matches native apps)

**ExifCleaner status**: ❌ Not implemented. Current code shows window immediately. Quick Win #5 (5 min, high UX impact).

### Platform-Specific Menus

**Use native menu bar with platform-specific shortcuts.**

```typescript
// src/main/menu/buildMenu.ts
import { Menu, shell, app } from 'electron';
import { isMac } from '../common/platform';

export function buildMenu(): Menu {
  const template: Electron.MenuItemConstructorOptions[] = [];

  // macOS app menu
  if (isMac()) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  // File menu
  template.push({
    label: 'File',
    submenu: [
      {
        label: 'Open Files…',
        accelerator: 'CmdOrCtrl+O', // Cmd on Mac, Ctrl on Win/Linux
        click: () => { /* open file dialog */ },
      },
      { type: 'separator' },
      isMac() ? { role: 'close' } : { role: 'quit' },
    ],
  });

  // Edit menu (standard shortcuts)
  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  });

  // Window menu
  template.push({
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      ...(isMac()
        ? [
            { type: 'separator' as const },
            { role: 'front' as const },
          ]
        : [
            { role: 'close' as const },
          ]),
    ],
  });

  // Help menu
  template.push({
    role: 'help',
    submenu: [
      {
        label: 'Learn More',
        click: () => shell.openExternal('https://exifcleaner.com'),
      },
    ],
  });

  return Menu.buildFromTemplate(template);
}
```

**Key principles**:
- Use `CmdOrCtrl` for shortcuts (Cmd on Mac, Ctrl elsewhere)
- Use menu `role` for standard actions (undo, copy, paste, quit)
- Platform-specific structure (macOS app menu, Windows/Linux quit in File)

**ExifCleaner status**: ✅ Implemented in `src/main/menu*.ts`. Uses platform-specific menus.

### System Theme Integration

**Respect OS theme preference. Never hard-code light/dark mode.**

```typescript
// src/main/theme/setupTheme.ts
import { nativeTheme, ipcMain } from 'electron';

export function setupTheme(): void {
  // Listen for theme changes and notify renderer
  nativeTheme.on('updated', () => {
    // Broadcast to all windows
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('theme-changed', {
        shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
      });
    });
  });

  // Allow renderer to query current theme
  ipcMain.handle('theme:get', () => ({
    shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
    themeSource: nativeTheme.themeSource,
  }));

  // Optional: allow user to override theme
  ipcMain.handle('theme:set', (event, source: 'system' | 'light' | 'dark') => {
    nativeTheme.themeSource = source;
  });
}
```

**CSS side (renderer)**:

```css
/* src/styles/vars.css */
:root {
  /* Light mode colors */
  --bg-color: #ffffff;
  --text-color: #333333;
}

@media (prefers-color-scheme: dark) {
  :root {
    /* Dark mode colors */
    --bg-color: #1e1e1e;
    --text-color: #e0e0e0;
  }
}

/* Respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

**ExifCleaner status**: ✅ Partial. CSS uses `prefers-color-scheme` for dark mode. No IPC to query/set theme dynamically.

### Window State Persistence

**Save and restore window size, position, and state.**

```typescript
// src/main/windows/windowState.ts
import Store from 'electron-store';
import { screen, BrowserWindow } from 'electron';

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

const store = new Store<{ windowState?: WindowState }>({ name: 'window-state' });

export function loadWindowState(): WindowState {
  const defaultState = { width: 1100, height: 740 };
  const saved = store.get('windowState');

  if (!saved) return defaultState;

  // Validate saved state against current display bounds
  const { workArea } = screen.getPrimaryDisplay();
  if (
    saved.x !== undefined &&
    saved.y !== undefined &&
    saved.width > 0 &&
    saved.height > 0 &&
    saved.x >= workArea.x &&
    saved.y >= workArea.y &&
    saved.x + saved.width <= workArea.x + workArea.width &&
    saved.y + saved.height <= workArea.y + workArea.height
  ) {
    return saved;
  }

  // Invalid bounds, return default
  return defaultState;
}

export function saveWindowState(win: BrowserWindow): void {
  const bounds = win.getBounds();
  const state: WindowState = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized: win.isMaximized(),
  };
  store.set('windowState', state);
}

export function setupWindowStatePersistence(win: BrowserWindow): void {
  // Save state periodically and on close
  const save = () => saveWindowState(win);
  win.on('resize', save);
  win.on('move', save);
  win.on('close', save);
}
```

**ExifCleaner status**: ❌ Not implemented. Quick Win #6 (30 min, medium UX impact).

### Single Instance Lock

**Prevent multiple app instances. Focus existing window instead.**

```typescript
// src/main/app_setup.ts
import { app } from 'electron';

export function setupSingleInstance(): void {
  const gotLock = app.requestSingleInstanceLock();

  if (!gotLock) {
    // Another instance is running, quit
    app.quit();
    return;
  }

  // When second instance tries to launch, focus our window
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}
```

**ExifCleaner status**: ✅ Implemented in `src/main/app_setup.ts`.

### External Links: Always Open in System Browser

**Never navigate renderer to external URLs. Open in system browser.**

```typescript
// In navigation hardening (already shown above)
win.webContents.setWindowOpenHandler(({ url }) => {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:') {
      shell.openExternal(url); // Opens in system browser
    }
  } catch {
    // Invalid URL, ignore
  }
  return { action: 'deny' }; // Never open new Electron window
});
```

**Also apply to clicked links**:

```typescript
// src/renderer/externalLinks.ts
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.tagName === 'A' && target.hasAttribute('href')) {
    const href = target.getAttribute('href')!;
    if (href.startsWith('http://') || href.startsWith('https://')) {
      e.preventDefault();
      window.api.openExternal(href); // IPC to main → shell.openExternal
    }
  }
});
```

**ExifCleaner status**: ❌ Not implemented. Quick Win #7 (add window open handler: 5 min, add link click handler: 10 min).

### Accessibility (a11y)

**Ensure app is usable with keyboard only and screen readers.**

- Use semantic HTML (`<button>`, `<nav>`, `<main>`, not `<div onclick>`)
- Add ARIA labels where semantic HTML isn't enough
- Test keyboard navigation (Tab, Enter, Escape should work)
- Don't trap focus (Escape should close modals)
- Respect `prefers-reduced-motion` for animations

**ExifCleaner status**: ❌ Partial. Uses semantic HTML. No ARIA labels, no keyboard navigation testing.

---

## Performance Optimization

### Startup Performance (Biggest UX Lever)

**Goal: Minimize time from click → usable UI.**

**Pattern: "Fast shell, slow fill"**
1. Show window fast with minimal UI (skeleton/loading state)
2. Load data and expensive modules in background
3. Update UI progressively

**Concrete tactics**:

```typescript
// ❌ BAD: All modules loaded synchronously on startup
import { heavyModule } from './heavy';
import { anotherHeavyModule } from './another-heavy';
import { yetAnother } from './yet-another';

app.on('ready', () => {
  const win = createMainWindow(); // Blocked by imports
  win.loadURL(APP_URL);
});
```

```typescript
// ✅ GOOD: Lazy imports, deferred work
app.on('ready', () => {
  const win = createMainWindow(); // Fast
  win.loadURL(APP_URL);

  // Load heavy modules after window is shown
  win.once('ready-to-show', async () => {
    win.show();

    // Import heavy modules asynchronously
    const { heavyModule } = await import('./heavy');
    heavyModule.initialize();
  });
});
```

**Measure startup time**:

```typescript
// src/main/index.ts
const startTime = Date.now();

app.on('ready', () => {
  const win = createMainWindow();
  win.once('ready-to-show', () => {
    const elapsed = Date.now() - startTime;
    console.log(`[perf] Time to ready-to-show: ${elapsed}ms`);
    win.show();
  });
});
```

**Budget**: Target < 2 seconds from click → usable UI.

**ExifCleaner status**: ❌ Not measured. Current startup likely fast (small codebase), but no metrics. Quick Win #8 (add timing: 5 min, optimize if > 2s: variable).

### Avoid Sync I/O on Startup

**Never use `readFileSync` or `writeFileSync` on the critical path.**

```typescript
// ❌ BAD: Blocks event loop
app.on('ready', () => {
  const config = JSON.parse(fs.readFileSync('./config.json', 'utf8')); // BLOCKS
  createMainWindow(config);
});
```

```typescript
// ✅ GOOD: Async I/O or lazy load
app.on('ready', async () => {
  const win = createMainWindow(); // Fast
  win.loadURL(APP_URL);

  // Load config asynchronously after window is shown
  win.once('ready-to-show', async () => {
    win.show();
    const config = JSON.parse(await fs.promises.readFile('./config.json', 'utf8'));
    applyConfig(config);
  });
});
```

**ExifCleaner status**: ✅ Compliant. Uses `fs.promises` for exiftool operations.

### Use UtilityProcess for Heavy Work

**Main process must stay responsive. Push CPU-heavy work to UtilityProcess.**

```typescript
// src/main/workers/indexer.ts
import { utilityProcess } from 'electron';
import path from 'node:path';

export function startIndexer() {
  const child = utilityProcess.fork(path.join(__dirname, 'indexerWorker.js'), [], {
    serviceName: 'indexer',
  });

  child.on('message', (msg) => {
    console.log('[indexer]', msg);
  });

  child.postMessage({ type: 'start', path: '/path/to/index' });

  return child;
}
```

```typescript
// src/main/workers/indexerWorker.ts
process.parentPort.on('message', (msg) => {
  if (msg.type === 'start') {
    // Do heavy work here (parsing, compression, etc.)
    const result = heavyWork(msg.path);
    process.parentPort.postMessage({ type: 'result', data: result });
  }
});
```

**When to use UtilityProcess**:
- CPU-intensive tasks (parsing, compression, encryption)
- Crash-prone code (native modules, untrusted data)
- Tasks you don't want to block main process

**ExifCleaner status**: N/A (current workload is I/O-bound, not CPU-bound). Keep pattern for future features (e.g., batch processing, thumbnail generation).

### Memory: Avoid Large Stores

**Don't duplicate large data in main and renderer.**

```typescript
// ❌ BAD: Large array duplicated in renderer
const allFiles = await window.api.getAllFiles(); // 100,000 files
renderFileList(allFiles); // DOM explodes
```

```typescript
// ✅ GOOD: Paginate or stream
const page1 = await window.api.getFiles({ offset: 0, limit: 100 });
renderFileList(page1);

// Load more on scroll
```

**ExifCleaner status**: ✅ Compliant. Processes files one-by-one, no large stores.

### Profiling Tools

**Use Chrome DevTools to find performance bottlenecks.**

1. **Performance panel**: Record → interact → analyze flame graph
2. **Memory panel**: Heap snapshot → find leaks
3. **Tracing**: `chrome://tracing` for multi-process analysis

**ExifCleaner status**: ✅ Chrome DevTools MCP configured (`yarn dev:debug` launches with `--remote-debugging-port=9222`).

---

## Build & Packaging

### Tooling Recommendation (2025+)

**Pick one primary build tool and stick with it:**

- **Electron Forge** — Batteries-included, Vite + TS template, good documentation
- **electron-builder** — Widely used, excellent multi-platform support, auto-update support

**ExifCleaner status**: ✅ Uses `electron-builder` 22.8 (could upgrade to 25.x).

### Build Size Fundamentals

**Electron itself is large (~100-150 MB). Avoid adding unnecessary bloat.**

**Checklist**:
- ✅ Bundle renderer assets (tree-shake, code-split with Vite/esbuild)
- ✅ Ensure devDependencies don't get packaged
- ✅ Audit dependencies (remove duplicates, check bundle size)
- ✅ Don't ship source maps in production (or upload to crash backend)
- ✅ Keep native modules minimal (they increase size and complexity)

**Size budget**:
- macOS `.app`: < 150 MB
- Windows installer: < 100 MB
- Linux AppImage: < 120 MB

**Measure size**:

```bash
# macOS
du -sh dist/mac/ExifCleaner.app

# Windows
ls -lh dist/ExifCleaner-Setup-*.exe

# Linux
ls -lh dist/ExifCleaner-*.AppImage
```

**ExifCleaner status**: ✅ Current build is ~35 MB (macOS .dmg). Excellent size for an Electron app.

### ASAR Packaging

**Package app code into ASAR for faster startup and smaller size.**

```javascript
// electron-builder config (package.json or electron-builder.yml)
{
  "asar": true,
  "asarUnpack": [
    "**/*.node",           // Native modules
    "**/exiftool",         // Binaries
    "**/resources/**"      // Resources that must be accessible
  ]
}
```

**ExifCleaner status**: ✅ ASAR enabled. Binaries in `.resources/` are unpacked.

### Practical "Size Checklist"

**Run these checks on every release**:

```bash
# 1. Bundle analyzer (if using Vite)
npx vite-bundle-analyzer

# 2. Top 20 largest files
find dist/mac/ExifCleaner.app -type f -exec du -h {} + | sort -rh | head -20

# 3. Check for devDependencies in bundle
cd dist/mac/ExifCleaner.app/Contents/Resources/app.asar.unpacked
npm ls --production

# 4. Verify size budget
SIZE=$(du -sk dist/mac/ExifCleaner.app | cut -f1)
if [ $SIZE -gt 150000 ]; then
  echo "ERROR: Build exceeds 150 MB budget"
  exit 1
fi
```

**ExifCleaner status**: ❌ No automated size checks. Quick Win #9 (add CI size check: 15 min).

---

## ExifCleaner Implementation Status

### Security Baseline

| Pattern | Status | Location | Notes |
|---------|--------|----------|-------|
| `contextIsolation: true` | ✅ Implemented | `src/main/window_setup.ts` | Phase 3 (Electron 35) |
| `sandbox: true` | ✅ Implemented | `src/main/window_setup.ts` | Phase 3 (Electron 35) |
| `nodeIntegration: false` | ✅ Implemented | `src/main/window_setup.ts` | Phase 3 (Electron 35) |
| `devTools: false` in prod | ✅ Implemented | `src/main/window_setup.ts` | Uses `NODE_ENV` check |
| Preload with `contextBridge` | ✅ Implemented | `src/preload/index.ts` | Exposes `window.api` |
| Navigation hardening | ❌ Not implemented | — | Quick Win #1 (15 min) |
| Permission gate | ❌ Not implemented | — | Quick Win #2 (10 min) |
| CSP header | ❌ Not implemented | — | Quick Win #3 (5 min) |
| IPC sender validation | ❌ Not implemented | — | Quick Win #4 (15 min) |
| IPC payload validation | ❌ Not implemented | — | Quick Win #4 (30 min) |
| Typed IPC contract | ❌ Not implemented | — | Quick Win #4 (30 min) |

### Native Feel & Polish

| Pattern | Status | Location | Notes |
|---------|--------|----------|-------|
| Platform menus | ✅ Implemented | `src/main/menu*.ts` | macOS/Win/Linux menus |
| System theme | ✅ Partial | `src/styles/dark_mode.css` | CSS only, no IPC |
| Single instance lock | ✅ Implemented | `src/main/app_setup.ts` | Prevents duplicates |
| `ready-to-show` | ❌ Not implemented | — | Quick Win #5 (5 min) |
| Window state persistence | ❌ Not implemented | — | Quick Win #6 (30 min) |
| External link handling | ❌ Not implemented | — | Quick Win #7 (15 min) |
| Keyboard accessibility | ❌ Partial | — | Semantic HTML, no ARIA |

### Performance

| Pattern | Status | Location | Notes |
|---------|--------|----------|-------|
| Lazy imports | ❌ Not implemented | — | Current startup likely fast |
| No sync I/O on startup | ✅ Implemented | `src/main/exif_handlers.ts` | Uses `fs.promises` |
| Startup time measurement | ❌ Not implemented | — | Quick Win #8 (5 min) |
| UtilityProcess for heavy work | N/A | — | Current workload is I/O-bound |

### Build & Packaging

| Pattern | Status | Location | Notes |
|---------|--------|----------|-------|
| electron-builder | ✅ Implemented | `package.json` | v22.8, could upgrade to v25 |
| ASAR packaging | ✅ Implemented | `package.json` | Enabled, binaries unpacked |
| Size budget check | ❌ Not implemented | — | Quick Win #9 (15 min) |
| Bundle analyzer | ❌ Not implemented | — | Future improvement |

---

## Quick Wins

**Prioritized improvements with high impact and low effort.**

### Quick Win #1: Navigation Hardening (15 min, HIGH security)

**Goal**: Block untrusted navigation, prevent renderer from navigating to arbitrary URLs.

**Tasks**:
1. Create `src/main/security/navigation.ts` (copy pattern from Security Baseline section)
2. Call `hardenNavigation(win)` in `src/main/window_setup.ts` after creating window
3. Add ALLOWED_ORIGINS constant with `file://` origin
4. Test: Try navigating to `https://evil.com` in DevTools console → should be blocked

**Impact**: High security (prevents navigation-based attacks).

**Estimated time**: 15 minutes.

---

### Quick Win #2: Permission Gate (10 min, MEDIUM security)

**Goal**: Deny all permission requests by default.

**Tasks**:
1. Create `src/main/security/permissions.ts` (copy pattern from Security Baseline section)
2. Call `installPermissionGate()` in `src/main/index.ts` on `app.whenReady()`
3. Test: Trigger permission request in DevTools console → should be denied

**Impact**: Medium security (defense in depth, local app doesn't need permissions).

**Estimated time**: 10 minutes.

---

### Quick Win #3: CSP Header (5 min, HIGH security)

**Goal**: Add Content Security Policy to prevent XSS.

**Tasks**:
1. Add CSP `<meta>` tag to `src/renderer/index.html` (copy from Security Baseline section)
2. Test: Try `eval('alert(1)')` in DevTools console → should throw error

**Impact**: High security (prevents XSS even if sanitize.ts is bypassed).

**Estimated time**: 5 minutes.

---

### Quick Win #4: Typed IPC Contract (1 hour, HIGH maintainability)

**Goal**: Add type safety to all IPC channels.

**Tasks**:
1. Create `src/types/ipc.ts` with `IpcChannels` type (copy from IPC Design Patterns section)
2. Update `src/preload/index.ts` to use typed `invoke` wrapper
3. Update `src/main/exif_handlers.ts` to validate sender + payload with zod
4. Update `src/renderer/env.d.ts` to type `window.api` with contract
5. Test: TypeScript should catch IPC mismatches at compile time

**Subtasks**:
- Add sender validation (15 min)
- Add payload schemas with zod (30 min)
- Add typed contract (30 min)

**Impact**: High maintainability (type safety, easier refactoring, self-documenting).

**Estimated time**: 1 hour total (can split into 3 subtasks).

---

### Quick Win #5: Graceful Window Show (5 min, HIGH UX)

**Goal**: Prevent white flash on startup.

**Tasks**:
1. Update `src/main/window_setup.ts`: add `show: false` to BrowserWindow options
2. Add `win.once('ready-to-show', () => win.show())` before `win.loadURL()`
3. Test: Launch app → should not see white flash

**Impact**: High UX (professional feel, faster perceived startup).

**Estimated time**: 5 minutes.

---

### Quick Win #6: Window State Persistence (30 min, MEDIUM UX)

**Goal**: Remember window size and position across app restarts.

**Tasks**:
1. Add `electron-store` as devDependency: `yarn add -D electron-store`
2. Create `src/main/windows/windowState.ts` (copy from Native Feel section)
3. Call `loadWindowState()` in `createMainWindow()` to restore size/position
4. Call `setupWindowStatePersistence(win)` after creating window
5. Test: Resize window → quit → relaunch → should restore size/position

**Impact**: Medium UX (matches native apps, user convenience).

**Estimated time**: 30 minutes.

---

### Quick Win #7: External Link Handling (15 min, MEDIUM UX + security)

**Goal**: Open external links in system browser, never in app.

**Tasks**:
1. Add `setWindowOpenHandler` in navigation hardening (Quick Win #1)
2. Add renderer click handler for `<a>` tags (copy from Native Feel section)
3. Add `api.openExternal` to preload (`shell.openExternal` wrapper with URL validation)
4. Test: Click link to GitHub → should open in system browser

**Impact**: Medium UX (matches user expectations) + Medium security (prevents phishing).

**Estimated time**: 15 minutes.

---

### Quick Win #8: Startup Time Measurement (5 min, LOW effort, HIGH insight)

**Goal**: Measure cold start time to identify bottlenecks.

**Tasks**:
1. Add `const startTime = Date.now()` at top of `src/main/index.ts`
2. Add `console.log(\`[perf] Time to ready-to-show: ${Date.now() - startTime}ms\`)` in `ready-to-show` handler
3. Run `yarn dev` → check console for startup time
4. Set budget: If > 2000ms, investigate slow imports

**Impact**: High insight (identifies performance issues).

**Estimated time**: 5 minutes.

---

### Quick Win #9: CI Size Budget Check (15 min, MEDIUM DevOps)

**Goal**: Prevent build size regressions in CI.

**Tasks**:
1. Add size check script to `package.json`:
   ```json
   "check-size": "node scripts/check-size.js"
   ```
2. Create `scripts/check-size.js` (copy from Build & Packaging section)
3. Add to GitHub Actions workflow: `yarn check-size`
4. Set budget: 150 MB (macOS .app), fail CI if exceeded

**Impact**: Medium DevOps (prevents bloat, enforces discipline).

**Estimated time**: 15 minutes.

---

## LLM Project Rules

**Copy this section into LLM project memory verbatim. Use imperative voice for maximum effectiveness.**

### Invariants (ALWAYS enforce)

1. **Renderer has NO Node.js integration** — `nodeIntegration: false`, `sandbox: true`, `contextIsolation: true` in ALL BrowserWindow configs.
2. **All renderer→main access goes through preload** — Use `contextBridge.exposeInMainWorld` to expose minimal API surface.
3. **IPC uses typed contracts** — Define `IpcChannels` type in `src/types/ipc.ts`, use typed `invoke` wrapper in preload.
4. **IPC handlers validate sender + payload** — Check `event.sender.id` against allowlist, validate payloads with zod/valibot.
5. **Main process NEVER does CPU-heavy work** — Use UtilityProcess for parsing, compression, encryption, indexing.
6. **NEVER disable sandbox/webSecurity in production** — These are non-negotiable security defaults.
7. **Navigation is locked down** — Block `will-navigate` to untrusted origins, block `window.open`, only allow HTTPS external URLs to open in system browser.
8. **Permissions are denied by default** — Install `session.setPermissionRequestHandler` that denies everything unless explicitly allowed.
9. **Secrets use OS-backed crypto** — Use `safeStorage` for tokens, never store plaintext secrets.
10. **Production builds are hardened** — `devTools: false`, no debug flags (`--no-sandbox`, `--remote-debugging-port`), code signing enabled.
11. **Keep Electron current** — Review breaking changes, upgrade on a cadence (Electron 35 as of Phase 3).

### When Writing or Refactoring Code

**ALWAYS do these:**

- **Add security comment above every `webPreferences` block** — Explain why each setting is configured (e.g., "contextIsolation: true isolates preload from renderer globals").
- **Prefer small, typed APIs over raw capabilities** — Expose `api.pickFile()` not `api.readFile(anyPath)`. Let main enforce policy.
- **Validate ALL renderer input** — Treat renderer as hostile. Validate sender ID, validate payload schema, validate policy constraints.
- **Use native menus and dialogs** — `Menu.buildFromTemplate()` with platform-specific shortcuts, `dialog.showOpenDialog()` for file picking.
- **Respect system theme** — Use `nativeTheme` + CSS `prefers-color-scheme`, never hard-code light/dark mode.
- **Show window gracefully** — `show: false` + `ready-to-show` to prevent white flash.
- **Measure startup time** — Add timing logs, enforce < 2s budget.
- **Open external links in system browser** — Use `shell.openExternal()` after validating HTTPS protocol.
- **Test keyboard navigation** — Ensure Tab, Enter, Escape work. Use semantic HTML and ARIA.

### Forbidden Patterns (NEVER introduce)

**NEVER write code with these patterns:**

- ❌ `nodeIntegration: true` in any user-facing renderer
- ❌ `contextIsolation: false`
- ❌ `sandbox: false`
- ❌ `--no-sandbox`, `--disable-web-security`, `--remote-debugging-port` in production
- ❌ Exposing `eval`, `executeJavaScript`, shell execution, arbitrary file access to renderer
- ❌ Loading arbitrary remote content with elevated privileges
- ❌ `readFileSync` / `writeFileSync` on startup critical path (blocks event loop)
- ❌ Trusting renderer input without validation (sender, payload, policy)
- ❌ Passing user-controlled URLs to `shell.openExternal()` without validation
- ❌ Hard-coding theme (light/dark) instead of respecting system preference

### When Adding New IPC Channels

**ALWAYS update these 4 places:**

1. **`src/types/ipc.ts`** — Add channel to `IpcChannels` type with `req` and `res` types
2. **`src/preload/index.ts`** — Add channel to allowlist (typed `invoke` wrapper)
3. **`src/main/ipc/*.ts`** — Add handler with sender validation + payload validation (zod schema)
4. **Documentation** — Add comment explaining what the channel does and why it's needed

### Error Handling

- **Main process**: Throw `Error` objects with descriptive messages. Catch and convert to user-safe error results.
- **Renderer**: Show actionable messages ("Couldn't save file: permission denied") not raw stacks.
- **IPC**: Return `{ success: false, error: string }` instead of throwing across IPC boundary.

### Testing

- **Unit tests**: Pure TS logic in `src/common/`, `src/domain/`
- **Integration tests**: IPC handlers with mocked `event.sender`
- **E2E tests**: Playwright smoke tests for critical flows (drag-drop, file processing, dark mode)
- **Release gates**: Security lint, size budget, startup time budget, manual QA checklist

### Module Boundaries

- **`renderer/`** — NEVER import `electron`, NEVER import `node:*` modules. Only imports from `common/` (pure TS).
- **`preload/`** — ONLY imports `electron` (for `contextBridge`, `ipcRenderer`) and `types/`. No heavy logic.
- **`main/`** — Orchestrates windows, IPC, system integrations. Delegates heavy work to UtilityProcess.
- **`common/`** — Pure TS utilities, no Electron imports, no Node.js imports (except in files marked "main-only").

### Size Discipline

- **Bundle renderer assets** — Use Vite/esbuild tree-shaking, code-splitting.
- **Audit dependencies** — Remove duplicates, check bundle size impact before adding.
- **ASAR packaging** — Enable ASAR, unpack only native modules and binaries.
- **Size budget**: < 150 MB (macOS), < 100 MB (Windows), < 120 MB (Linux). Fail CI if exceeded.

### Startup Performance

- **"Fast shell, slow fill"** — Show window fast, load data/modules in background.
- **Lazy imports** — Defer heavy modules until after `ready-to-show`.
- **No sync I/O** — Use `fs.promises`, never `readFileSync` on critical path.
- **Startup budget**: < 2 seconds from click → usable UI. Measure and enforce in CI.

### Accessibility

- **Semantic HTML** — Use `<button>`, `<nav>`, `<main>`, not `<div onclick>`.
- **ARIA labels** — Add where semantic HTML isn't enough.
- **Keyboard navigation** — Tab, Enter, Escape should work everywhere.
- **Reduced motion** — Wrap animations in `@media (prefers-reduced-motion: no-preference)`.
- **Screen reader testing** — Test with VoiceOver (macOS), NVDA (Windows).

### Code Signing & Release

- **Sign all production builds** — macOS (notarization), Windows (Authenticode), Linux (optional).
- **HTTPS for updates** — Serve auto-update feed over HTTPS only.
- **Checksums** — Generate SHASUMS256.txt for all release artifacts.
- **Manual releases** — NEVER auto-publish. CI builds artifacts, maintainer publishes manually.

---

**End of LLM Project Rules**

---

## Summary

This document codifies Electron best practices for ExifCleaner with a focus on:

1. **Security** — Sandbox renderer, validate IPC, lock down navigation, deny permissions by default
2. **Performance** — Fast startup, lazy imports, UtilityProcess for heavy work
3. **Native feel** — Platform menus, system theme, graceful window show, external links in browser
4. **Maintainability** — Typed IPC contracts, module boundaries, error handling, testing gates
5. **Size discipline** — ASAR packaging, bundle analysis, size budgets, CI gates

**Next steps**:

- **Immediate**: Quick Wins #1-3 (navigation hardening, permission gate, CSP) — 30 min total, high security impact
- **Short-term**: Quick Wins #4-7 (typed IPC, graceful window show, window state, external links) — 2 hours total, high UX + maintainability impact
- **Medium-term**: Quick Wins #8-9 (startup time measurement, size budget CI) — 20 min total, high DevOps insight

**Resources**:

- [Electron Security Tutorial](https://electronjs.org/docs/latest/tutorial/security)
- [Electron IPC Tutorial](https://electronjs.org/docs/latest/tutorial/ipc)
- [Electron Performance Guide](https://electronjs.org/docs/latest/tutorial/performance)
- [VS Code Sandbox Migration](https://code.visualstudio.com/blogs/2022/11/28/vscode-sandbox)
- [Electron Fuses Tutorial](https://electronjs.org/docs/latest/tutorial/fuses)

---

**Document version**: 1.0.0 (February 15, 2026)
**Compatibility**: Electron 35+ with TypeScript 5.7+ strict mode
**Maintained by**: ExifCleaner project
