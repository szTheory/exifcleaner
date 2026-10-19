# Native-path HEIC/AVIF Fixture Provenance

Eight fixtures for the native HEIC/AVIF path (Phase 63-05, ADP-07, D-12). They exist so that
every native-path test exercises real `exifcleaner-node` output rather than an ExifTool
fallback. Six come from two independent encoder families (Apple ImageIO via `sips`, and
libheif/aom/x265 via `heif-enc`); two are the heif-enc grid files vendored by sha from
`exifcleaner-node` v0.4.0. All derive from the app-owned `sample.png`, the app-owned
`webp-oracle-profile.icc`, or node-owned MIT corpus files. None is a personal photograph.

| Field | Pinned value |
| --- | --- |
| macOS | 26.6.2 (build 25G83), `sw_vers` |
| sips | `sips-316` (`sips --version`) |
| heif-enc | 1.19.7 (`heif-enc --version`), libheif 1.19.7 |
| heif-enc AVIF encoder | `aom = AOMedia Project AV1 Encoder 3.12.0 [default]` |
| heif-enc HEIC encoder | `x265 = x265 HEVC encoder (4.1+1-1d117be) [default]` |
| Bundled ExifTool | 13.59 (`exiftool -ver`) |
| exifcleaner-node tag | `v0.4.0` (grid files, MIT) |

## Commands

Run from `exifcleaner-electron`, each twice into two scratch directories; the two sha256 values
were identical for every generated fixture (determinism double run).

```sh
sips -s format heic tests/e2e/fixtures/sample.png --out <dest>/sample-sips.heic   # from 63-02
sips -s format avif tests/e2e/fixtures/sample.png --out <dest>/sample-sips.avif
sips -s format heic --embedProfile tests/e2e/fixtures/webp-oracle-profile.icc tests/e2e/fixtures/sample.png --out <dest>/sample-sips-icc.heic
sips -s format avif --embedProfile tests/e2e/fixtures/webp-oracle-profile.icc tests/e2e/fixtures/sample.png --out <dest>/sample-sips-icc.avif
heif-enc -o <dest>/sample-heifenc.heic tests/e2e/fixtures/sample.png
heif-enc -A -o <dest>/sample-heifenc.avif tests/e2e/fixtures/sample.png
git -C ../exifcleaner-node show v0.4.0:tests/corpus/constructed/heic/heif-enc-grid.heic > tests/e2e/fixtures/grid-heifenc.heic
git -C ../exifcleaner-node show v0.4.0:tests/corpus/constructed/avif/heif-enc-grid.avif   > tests/e2e/fixtures/grid-heifenc.avif
.resources/nix/bin/exiftool -s3 -FileType <file>
.resources/nix/bin/exiftool -G1 -s -HandlerDescription <file>
```

heif-enc accepted the 1x1 `sample.png` directly, so no `sips -z 8 8` intermediate was needed.

## Per-fixture table

`HandlerDescription` is empty for all eight (ExifTool reports no QuickTime handler string).

| Local name | Producer | Bytes | SHA-256 | `-FileType` | HandlerDescription |
| --- | --- | --- | --- | --- | --- |
| `sample-sips.heic` | sips (ImageIO), from 63-02 | 1,287 | `588fb84253201065e7511031b606e597a47e2e569dabe57d4b384249b7be7c78` | HEIC | none |
| `sample-sips.avif` | sips (ImageIO) | 1,169 | `8c4fe3915e7c4573872263dc0a29aabeb8550590fb848ed121b05ef551e75592` | AVIF | none |
| `sample-sips-icc.heic` | sips + embedded ICC | 1,772 | `ac0a8c04f1698002d1f764da4f151bc94bf576f5ef8af276e7a80cdeaabfa545` | HEIC | none |
| `sample-sips-icc.avif` | sips + embedded ICC | 1,654 | `758a42df68c0582fdda21b49460dd06f66582f8e0e39ac69f819deffb937db57` | AVIF | none |
| `sample-heifenc.heic` | heif-enc (libheif/x265) | 456 | `140bfc4339297cd8629732650ca760b6a0e0b74d1094d1ff7ed4f2e07ceb3c21` | HEIC | none |
| `sample-heifenc.avif` | heif-enc -A (libheif/aom) | 296 | `3e8d9bb7a60987c62efc52e02d91b47fa76b4adc899c5c7109ef9b1f6b7c0817` | AVIF | none |
| `grid-heifenc.heic` | exifcleaner-node v0.4.0 corpus (MIT) | 4,243 | `ae40a80f0a85cd984b9d8b1a2e811e138ac2c8c26f14b77360d62e1e4867bad6` | HEIC | none |
| `grid-heifenc.avif` | exifcleaner-node v0.4.0 corpus (MIT) | 3,997 | `682a1e626c4d8db4f7ccf4a2d5058d0104394f7a08d0a70fad3950bed4b0a85e` | AVIF | none |

The sha pin is the authority, not regeneration: sips output may differ on other macOS builds.
`generate_fixtures.ts` registers this set as verify-only (`HEIF_FIXTURE_SPECS`,
`verifyHeifFixtures`): it re-hashes and checks FileType, and never regenerates. No encoder is
added to CI and no dependency is added.

The existing `QuickTime.heic` (ExifTool-corpus, `-FileType HEIF`) is deliberately not in this
set; it remains the ExifTool-path fixture and is the negative control of the admission test.

## Seeding

Identifying variants are never committed (D-13). Tests that need an identifying HEIC/AVIF copy
a committed fixture into a temp directory and seed it with `seedHeifCopy` from
`tests/helpers/heif_seed.ts`, which refuses to touch this directory. The arguments
(`HEIF_SEED_ARGS`) are, verbatim:

```
-Artist=ZZ63-ARTIST -Copyright=ZZ63-COPYRIGHT -Make=ZZ63-MAKE -Model=ZZ63-MODEL
-GPSLatitude=37.7749 -GPSLatitudeRef=N -GPSLongitude=122.4194 -GPSLongitudeRef=W
-XMP-dc:Creator=ZZ63-CREATOR "-DateTimeOriginal=2020:01:02 03:04:05" -Orientation#=6
-IFD0:XResolution=300 -IFD0:YResolution=300 -IFD0:ResolutionUnit=inches
```

## Executable assertions

`fixture_integrity.test.ts` (`HEIF_FIXTURE_PINS`) checks size, digest, `-FileType` and the Git
`binary` attribute of each file; `tests/integration/heif_fixture_admission.test.ts` proves
`exifcleaner-node` 0.4.0 admits each one natively in all 8 preservation combos.
