# Contributing to ExifCleaner

Thanks for helping. Small, focused pull requests are easiest to review and safest for a
desktop privacy tool.

## Start here

- Read the [engineering guide](docs/README.md) before changing a subsystem.
- Open or reference an issue for behavior changes; explain the user outcome, not a proposed
  refactor alone.
- Keep network access, telemetry, and background update checks out of the application.
- Do not weaken sender validation, sandboxing, output verification, directory-effect
  assertions, or packaged smoke tests.

## Local workflow

```bash
yarn install
yarn dev
yarn typecheck
yarn test
yarn test:e2e
```

Before opening a PR, run `yarn lint`, `yarn check:deps`, and the tests closest to your
change. Packaging/release changes also need the relevant packaged-smoke path described in
[Build, tests, and releases](docs/subsystems/build-test-release.md).

## Translation corrections

Translations live in `.resources/locales/<locale>.json`. English is the canonical key set.
A useful translation PR can change one string; it does not need to complete the locale.

1. Edit only your locale file. Use the existing English key and preserve placeholders such
   as `{count}` exactly.
2. Run `yarn i18n:write` to regenerate `.resources/strings.json` and the coverage report.
3. Run `yarn i18n:check` and test the locale with `yarn dev --lang=<locale>`.
4. In the PR, say whether you are a native speaker and briefly explain wording that is
   context-sensitive.

AI suggestions are welcome as review notes, but they must be labeled as AI-assisted and
must not replace an existing human translation without a fluent reviewer.

## Pull-request shape

- One user outcome or maintenance concern per PR.
- Add a regression test that would have failed before the change.
- Update docs when an IPC contract, safety invariant, setting, processing outcome, or
  release gate changes.
- Avoid drive-by formatting, comment removal, dependency churn, or unrelated TODO cleanup.

