# Electron and IPC boundaries

ExifCleaner assumes filenames and metadata are untrusted, even though all work is local.
The renderer is sandboxed; main is the only process allowed to touch the filesystem or
spawn ExifTool.

## Boundary chain

`IpcInvokeMap` and `IpcSendMap` are the compile-time contract. Preload’s `TypedInvoke`
binds calls to it. Main wraps invoke handlers with `createValidatedHandler()`, which checks
the sender and parses payloads before application code runs.

The division is deliberate:

- **invoke** for operations whose result changes UI truth;
- **send** for progress notifications where no response is needed;
- **main-to-renderer events** for menus, theme, language, and OS-open-file events.

## Security posture

- `nodeIntegration` is off, context isolation and sandboxing are on.
- Navigation outside the packaged renderer is blocked by `hardenNavigation()`.
- Permission requests are denied by default.
- Only registered window senders may invoke privileged handlers.
- Native file/folder dialogs run only after an explicit user action.
- External release links open in the system browser; the app does not fetch updates.

## The stay-open newline boundary

ExifTool’s `-@ -` protocol treats newlines as argument separators. A path containing CR or
LF therefore cannot be escaped as an ordinary path; it must be rejected before command
assembly. Keep the validation at the main/adapter boundary even if renderer-side checks
are added for faster feedback.

## Adding a channel

1. Add one constant and its request/response shape to the shared map.
2. Expose the smallest method in preload.
3. Add a runtime schema and sender-validated main handler.
4. Test malformed payloads, unauthorized senders, cancellation, and the successful path.
5. Do not expose raw `ipcRenderer`, `shell`, `dialog`, or filesystem primitives.

