# Oracle Known-Gaps RED Proof

Date: 2026-07-30
Base commit before Task 1: `a576bf0`
App version: `4.0.0`
Node: `v22.14.0`
Yarn: `1.22.22`
Bundled ExifTool: `13.50`

## Command

```text
yarn compile
PLAYWRIGHT_JSON_OUTPUT_NAME=docs/evidence/2026-07-30-oracle-known-gaps-red-proof.json yarn test:e2e tests/e2e/oracle-accountability.spec.ts --grep "#240" --reporter=list,json
```

## Fixture Preconditions

The precondition was verified before adding the marker:

```text
yarn test tests/e2e/fixtures/fixture_integrity.test.ts
```

Result: 14 fixture-integrity tests passed, including the `issue240.mp4` checks for the three measured create-date values.

Before app processing, `issue240.mp4` contains:

```json
{
	"CreateDate": "2019:10:02 00:49:04",
	"TrackCreateDate": "2019:10:02 00:49:04",
	"MediaCreateDate": "2019:10:02 00:49:04"
}
```

## RED Result

The focused Playwright run exited nonzero with one collected test:

```text
#240 stripped MP4 does not retain create-date metadata
```

The failure was issue-owned and residual-specific:

```text
#240 residual create-date metadata after stripping: CreateDate, TrackCreateDate, MediaCreateDate
```

After real Electron `file-open-add-files` processing, the measured residual set was:

```json
{
	"CreateDate": "2019:10:02 00:49:04",
	"TrackCreateDate": "2019:10:02 00:49:04",
	"MediaCreateDate": "2019:10:02 00:49:04"
}
```

The JSON reporter output is preserved at:

```text
docs/evidence/2026-07-30-oracle-known-gaps-red-proof.json
```

## Non-Reproduction Boundary

The fixture-discovery transcript measured `#217` and `#255` through the same real application path and found no residual `Source`, `XResolution`, or `YResolution` tags after processing. This plan therefore creates no `#217` or `#255` expected-failure markers and no matching allow records.

## Verdict

`#240` has one measured application-flow failure. The final source should retain the same executable body as a direct declaration-time `test.fail` marker so the suite goes stale when the bug is fixed.
