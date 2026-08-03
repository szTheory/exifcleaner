# ExifCleaner engineering guide

Current app version: 4.1.0

This is the shortest useful path through the codebase. It explains ExifCleaner’s own
constraints and seams; it does not reteach Electron, React, or TypeScript.

## Read in this order

1. [Architecture](architecture/overview.md) — processes, layers, and the rules that keep user files safe.
2. [Code walkthrough](guides/code-walkthrough.md) — trace one file from selection to a truthful result row.
3. Open a subsystem only when you need it:
   - [File processing and output safety](subsystems/file-processing.md)
   - [Electron and IPC boundaries](subsystems/electron-boundaries.md)
   - [Renderer state and results](subsystems/renderer-state-and-results.md)
   - [Settings and localization](subsystems/settings-and-localization.md)
   - [Build, tests, and releases](subsystems/build-test-release.md)

## Where should I look?

| Job | Start here |
|---|---|
| Change what ExifTool removes | `StripMetadataCommand`, then the file-processing guide |
| Add an IPC capability | `IpcInvokeMap`, then the Electron-boundaries guide |
| Change a result or table interaction | `AppContext` and `FileTable` |
| Add a preference | `settings_schema.ts`, then settings/localization |
| Debug a packaged-only failure | build/test/release, then `tests/smoke/` |
| Understand why a file was not changed | the outcome model in file processing |

Historical release proofs live in `docs/evidence/`. They are evidence, not onboarding
material, and are intentionally outside this reading path.

