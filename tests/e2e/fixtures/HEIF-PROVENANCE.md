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

## Third-party fixture: link-u red-at-12-oclock

`red-at-12-oclock-with-color-profile-lossy.avif` is the ExifTool-path AVIF (63-06, ADP-07, D-13,
D-17). exifcleaner-node 0.4.0 declines it pre-write (`unsafe-structure`, decline class
`surviving-offset-width-zero`), so the app reaches ExifTool for it through the real router.

- Title: red-at-12-oclock-with-color-profile-lossy.avif
- Author: Tony Payne <tpayne@chromium.org>
- Source: https://raw.githubusercontent.com/link-u/avif-sample-images/c666a368b73006246694919b5dbcc078317af6cc/red-at-12-oclock-with-color-profile-lossy.avif
- Pinned upstream commit: `c666a368b73006246694919b5dbcc078317af6cc`
- Upstream SPDX: `LGPL-2.1-only OR BSD-2-Clause` (upstream README, section "Red at 12 o'clock with
  color profile - ICC Profile tests": "GNU LGPL v2.1 or 2 claused BSD License"; the repository's
  root `LICENSE.txt`, CC-BY-SA-4.0, does not govern this file per the README's per-image override)
- ExifCleaner elects the BSD-2-Clause option. The file is not distributed under the LGPL option.
- Vendored from `git -C ../exifcleaner-node show v0.4.0:tests/corpus/upstream/link-u-avif-sample-images-c666a36/red-at-12-oclock-with-color-profile-lossy.avif`
- Modified: no
- SHA-256: `79483242f2dca12c4ec18bd33ff8099216b3094fb55a26a909f046b2f9b4ce58` (equals the node manifest record `link-u-red-at-12-oclock`)
- Size: 2,840 bytes; `-FileType` AVIF
- Measured `QuickTime:HandlerDescription`: `cavif - https://github.com/link-u/cavif` (F-63-6). This
  non-empty handler string is why the file is the fail-closed negative control for the F-HEIC-ICC
  positive (D-17) and is never used as that positive.

Licence text. The upstream repository ships no BSD-2-Clause licence file for this image (the only
licence file at the pinned commit is the CC-BY-SA-4.0 `LICENSE.txt`, which the README overrides for
this file; it names the Chromium/WebKit commit
`https://chromium.googlesource.com/chromium/src/+/e89ab1941644ff34b262cac05f23e82b7e249377` as the
origin and states no copyright line of its own). The standard BSD 2-Clause conditions, reproduced
here under the election above:

```
Copyright (c) Tony Payne <tpayne@chromium.org> (attribution as given by the upstream README)

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

`QuickTime.heic` (ExifTool 13.59 `t/images`, FileType `HEIF`, empty handler) is the other
ExifTool-path fixture; node declines it as `unsupported-format` ("iinf version 2 is not
supported").
