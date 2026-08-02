# Orientation preservation red proof

**Captured:** 2026-07-30T21:16:34Z

This record proves the exact `Orientation = Rotate 90 CW` application-flow assertion fails when
only the orientation copy-back is removed, and passes again after the production source is restored.

## Environment

| Field | Value |
|---|---|
| HEAD at capture start | `c532ca5ad414cb71f7b279e585c9f00aadbb6559` |
| `git describe --tags --always` | `v4.0.0-73-gc532ca5` |
| Commit date | `2026-07-30T17:15:29-04:00` |
| OS / kernel | `Darwin MacBook-Pro.local 25.5.0 Darwin Kernel Version 25.5.0: Mon Apr 27 20:41:12 PDT 2026; root:xnu-12377.121.6~2/RELEASE_ARM64_T6050 arm64` |
| Node | `v22.14.0` |
| Yarn | `1.22.22` |
| Playwright | `1.62.0` |
| Electron | `^35` |
| TypeScript | `~5.7.0` |
| ExifTool | `13.50` |
| Starting source SHA-256 | `8d66cbead456d739ed0c3c5af585c335f944d56117dffd5d077c026f8ee83b22` |
| Restored source SHA-256 | `8d66cbead456d739ed0c3c5af585c335f944d56117dffd5d077c026f8ee83b22` |

## Controlled Mutation

The only source mutation removed `-Orientation` from the copy-back tags while preserving every
other ExifTool argument.

```diff
diff --git a/src/application/commands/strip_metadata_command.ts b/src/application/commands/strip_metadata_command.ts
index df82064..54ce22e 100644
--- a/src/application/commands/strip_metadata_command.ts
+++ b/src/application/commands/strip_metadata_command.ts
@@ -38,7 +38,6 @@ export class StripMetadataCommand {
 		const args: string[] = ["-all="];
 
 		const preserveTags: string[] = [];
-		if (preserveOrientation) preserveTags.push("-Orientation");
 		if (preserveColorProfile) preserveTags.push("-ICC_Profile");
 
 		if (preserveTags.length > 0) {
```

## RED Command

```bash
yarn compile
PLAYWRIGHT_JSON_OUTPUT_NAME=docs/evidence/2026-07-30-orientation-red-proof.json \
  yarn test:e2e tests/e2e/settings.spec.ts \
  --grep "preserves orientation metadata when toggle is enabled" \
  --reporter=list,json
```

Observed RED exit code: `1`. The JSON reporter was written verbatim to
`docs/evidence/2026-07-30-orientation-red-proof.json`.

## RED Verdict

```text
Running 1 test using 1 worker

  x  1 [dev] - tests/e2e/settings.spec.ts:116:2 - Settings - preserves orientation metadata when toggle is enabled (866ms)

Error: expect(received).toBe(expected) // Object.is equality

Expected: "Rotate 90 CW"
Received: undefined

  143 |
  144 |             const tagsAfter = await readMetadataTags(tempFile);
> 145 |             expect(tagsAfter.Orientation).toBe(expectedOrientation);
      |                                           ^
```

Machine-readable reporter facts:

| Field | Value |
|---|---|
| Test title | `preserves orientation metadata when toggle is enabled` |
| File / line | `settings.spec.ts:116` |
| Status | `unexpected` |
| Expected | `Rotate 90 CW` |
| Received | `undefined` |

## Restoration

The mutation was reversed before any staging. Restoration gates:

```bash
shasum -a 256 src/application/commands/strip_metadata_command.ts
git diff --exit-code -- src/application/commands/strip_metadata_command.ts
```

Both gates passed. The restored SHA-256 exactly equals the starting SHA-256:
`8d66cbead456d739ed0c3c5af585c335f944d56117dffd5d077c026f8ee83b22`.

## GREEN Command

```bash
yarn compile
yarn test:e2e tests/e2e/settings.spec.ts --grep "preserves orientation metadata when toggle is enabled"
```

Observed GREEN exit code: `0`.

## GREEN Verdict

```text
Running 1 test using 1 worker

  ok 1 [dev] - tests/e2e/settings.spec.ts:116:2 - Settings - preserves orientation metadata when toggle is enabled (827ms)

1 passed (1.2s)
```

## Conclusion

The strengthened test is non-vacuous: a non-empty metadata object without `Orientation` fails the
exact assertion, and the healthy production source preserves `Orientation = Rotate 90 CW` through
the real application processing path.
