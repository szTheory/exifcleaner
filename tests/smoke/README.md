# Packaged-artifact smoke tests

These tests exercise the **built artifact** — the `.dmg` / `.exe` / `.AppImage` a user
downloads, installed the way a user installs it. They are separate from `../e2e`, which
tests the dev build from `out/`.

## Why this exists

Four consecutive releases shipped broken while CI was green. CI proved the source tree
compiles; nothing ever proved the shipped artifact runs.

| Issue | What shipped broken | Why CI missed it |
|---|---|---|
| #288 | Packaged app failed to launch | Env detection read `NODE_ENV`, which is undefined in a packaged Electron app. The dev build set it, so dev tests passed. |
| #289 | Release job died at the build step | `electron-builder` invoked bare; it is a devDependency and not on PATH. That step only ever ran during a real release. |
| #290 | macOS reported the app as "damaged" | Gatekeeper blocks at the OS level, before process start. Nothing in CI ever assessed a packaged bundle. |

## Running locally

```bash
# macOS — fast --dir build, still runs afterPack so the ad-hoc signature is real
yarn packmacdir
EXIFCLEANER_PACKAGED_APP="$PWD/dist/mac-arm64/ExifCleaner.app/Contents/MacOS/ExifCleaner" \
  yarn test:smoke

# macOS — full DMG path, as CI runs it
yarn packmac
APP=$(scripts/smoke/install-macos.sh dist/*arm64.dmg /tmp/exifcleaner-smoke)
node scripts/gatekeeper_check.mjs --app "$(dirname "$(dirname "$APP")")"
EXIFCLEANER_PACKAGED_APP="$APP" yarn test:smoke

# Linux
yarn packlinux
APP=$(scripts/smoke/install-linux.sh dist/*.AppImage /tmp/exifcleaner-smoke)
EXIFCLEANER_PACKAGED_APP="$APP" xvfb-run --auto-servernum yarn test:smoke

# Windows (PowerShell)
yarn packwin
$app = ./scripts/smoke/install-windows.ps1 -DistDir dist
$env:EXIFCLEANER_PACKAGED_APP = $app; yarn test:smoke
```

## The Gatekeeper gate, and why it looks backwards

`scripts/gatekeeper_check.mjs` runs two layers and **ignores `spctl`'s exit code**. That
is deliberate. Do not "fix" it.

An ad-hoc-signed app is *expected* by Apple's own model to be rejected by `spctl` — that
rejection is exactly what the bypassable "unidentified developer" dialog looks like from
the CLI. A gate written as `spctl --assess || exit 1` is permanently red on a perfectly
healthy build. It then gets `|| true`'d within a week and deleted within a month, which
is the same shortcut that let #290 reach users.

So: layer 1 (`codesign --verify --deep --strict`) treats the exit code as authoritative,
and layer 2 (`spctl -a -vv`) parses the **verdict text** only. Fatal markers are checked
*before* the allow-list, because macOS can emit an acceptable-looking `source=` line and a
sealed-resource complaint in the same output.

The parser is unit-tested in `tests/scripts/gatekeeper_check.test.ts`, which runs on the
Ubuntu job — no macOS needed. That is the anti-rot mechanism.

## Negative-test protocol

> A gate never made to fail is not a proven gate.

Run these on a throwaway branch before trusting any gate green. **Each has a predicted
failure. If the observed failure differs from the prediction, the gate is wrong even
though it went red.**

### #290 — Gatekeeper (run locally on macOS; iterating on `spctl` strings via CI is the worst time-sink available)

```bash
yarn packmacdir
APP=dist/mac-arm64/ExifCleaner.app

# Baseline must be GREEN first, or the negative tests prove nothing.
node scripts/gatekeeper_check.mjs --app "$APP"

# Variant A — unsigned nested code. Expect LAYER 1 to catch it.
cp -R "$APP" /tmp/gk-A.app
codesign --remove-signature "/tmp/gk-A.app/Contents/Frameworks/ExifCleaner Helper.app"
node scripts/gatekeeper_check.mjs --app /tmp/gk-A.app
#   PREDICTED: exits 1 at layer 1; codesign nonzero; output names the helper.
#              spctl never runs.

# Variant B — broken outer seal. Expect LAYER 2 to catch what layer 1 cannot.
cp -R "$APP" /tmp/gk-B.app
codesign --remove-signature "/tmp/gk-B.app/Contents/Frameworks/Electron Framework.framework"
codesign --force --sign - /tmp/gk-B.app        # NOTE: no --deep — outer seal only
node scripts/gatekeeper_check.mjs --app /tmp/gk-B.app
#   PREDICTED: exits 1 at layer 2 with a sealed-resource or damaged marker.
#   THE LOAD-BEARING OBSERVATION is whether layer 1 PASSED. If codesign also
#   catches B, the two-layer rationale is weaker than believed — record that
#   finding in the script header rather than keeping a justification the
#   evidence contradicts.

rm -rf /tmp/gk-A.app /tmp/gk-B.app
```

### Vacuity — prove the gate cannot silently become decorative

Comment out the `xattr -w` call in `gatekeeper_check.mjs` and re-run.
**PREDICTED:** fails at the read-back guard with "quarantine attribute did not apply".
Without this guard, a future macOS that made `xattr -w` a no-op would leave both layers
passing trivially and the gate green forever while testing nothing.

### #288 — packaged env detection (run in CI, all three platforms)

Revert `src/infrastructure/electron/env.ts` to
`isProd() { return process.env.NODE_ENV === "production"; }`.

**PREDICTED:** `app.isPackaged` assertion fails outright; the ExifTool spawn test fails
`ENOENT`; the strip-metadata test fails at `waitForProcessing` or on remaining tags. The
launch test may still pass — the window renders fine with mis-resolved paths, which is
exactly why the metadata assertion, not the window assertion, is the real gate.

**If the smoke suite goes green under this revert, the suite is worthless and must be
redesigned before proceeding.** This is the single most important verification here.

### #289 — electron-builder not on PATH (run in CI)

In a workflow, replace `run: yarn packmac` with a bare `electron-builder --macos`.
**PREDICTED:** the build step fails `command not found` before any artifact exists.
The durable property being proven is that the only way to build is through a `yarn`
script, which puts `node_modules/.bin` on PATH.

## Deliberate differences from the dev suite

- **Empty console-error allow-list.** `../e2e/file-processing.spec.ts` filters out
  `ExifTool` and `ENOENT` — precisely the error class #288 produced. Filtering them here
  would reproduce the blind spot this suite exists to close.
- **Serial mode, `workers: 1`.** The packaged app holds an OS-level single-instance lock,
  so concurrent launches deadlock rather than fail cleanly. This is a constraint, not a
  tuning knob.
- **No `NODE_ENV`, no `cwd`.** A packaged app must resolve everything from
  `process.resourcesPath`. Supplying either would mask the #288 class of bug.
- **`metadata_assertions` uses the repo's ExifTool, not the bundled one.** That is
  deliberate: it gives an independent oracle. If both pointed at the bundled binary, a
  broken bundle could produce a self-consistent false pass.
