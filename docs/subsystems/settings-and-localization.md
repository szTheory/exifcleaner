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
key/value JSON file containing only translations it actually has. Romanian (`ro`, with
`ro-RO` fallback) is complete; its first 70 strings retain credit to PR #297's contributor.

`.resources/translation-provenance.json` records a SHA-256 hash of the English source for
every translated key, its origin (`existing-contribution` or `agent-assisted`), and review
state. An intentional source-identical translation also records a concise justification.
A changed English source therefore makes the translation stale until someone reviews it;
running the generator never silently refreshes that hash. The glossary documents product
terms and safety-sensitive context for translators.

Running `yarn i18n:write` deterministically generates the legacy bundled `strings.json`,
the coverage report, and `translation-worklist.json`. `yarn i18n:check` fails on generated
drift, malformed data, unknown keys, placeholder mismatch, missing or stale text in any
locale, or source-identical text without an explicit reviewed justification. A current tree
has an empty worklist and complete coverage for every supported locale.

English fallback is intentional. Agent-assisted translations are drafted outside the app
and CI, labeled in provenance, and independently reviewed. The application and build have
no translation service or model client. Existing nonblank contributor text is never
overwritten by the generator.

The renderer updates `<html lang>` and `dir` when the selected locale changes. Arabic and
Persian use RTL layout; filenames, paths, and metadata values isolate their own direction.
Count messages select plural categories with `Intl.PluralRules` before lookup.

See [CONTRIBUTING](../../CONTRIBUTING.md) for the small translation-PR workflow.
