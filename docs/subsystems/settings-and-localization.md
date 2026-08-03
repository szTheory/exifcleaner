# Settings and localization

Settings are versioned JSON stored under Electron’s user-data directory. `SettingsService`
loads, migrates, validates, and atomically replaces the file. A failed disk write keeps the
session cache usable and reports through the local logger.

## Defaults and migrations

New installations default to Save as Copy. Migration never replaces an existing user’s
stored choice. Schema v4 also maps the historical Vietnamese code `vn` to the standard
Electron locale `vi`.

When adding a setting:

1. Add the typed field and new-install default.
2. Add an explicit migration when old persisted meaning changes.
3. Validate untrusted JSON and partial IPC updates.
4. Wire main, renderer, translation keys, and tests.
5. State precisely what the preference guarantees; do not broaden ExifTool behavior in copy.

## Translation sources

`.resources/locales/en.json` is the canonical key set. Each other locale is a simple
key/value JSON file containing only translations it actually has. Running
`yarn i18n:write` generates the legacy bundled `strings.json` plus a coverage report;
`yarn i18n:check` fails on drift, unknown keys, or placeholder mismatch.

English fallback is intentional. AI review may suggest wording with provenance, but it
does not fill or overwrite contributor translations automatically.

The renderer updates `<html lang>` and `dir` when the selected locale changes. Arabic and
Persian use RTL layout; filenames, paths, and metadata values isolate their own direction.
Count messages select plural categories with `Intl.PluralRules` before lookup.

See [CONTRIBUTING](../../CONTRIBUTING.md) for the small translation-PR workflow.

