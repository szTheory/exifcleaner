# Colour Fixture Provenance

Two 16x16 colour JPEG fixtures (Phase 69-02, OVR-01, D-21, amendment A2). They exist because the
three older JPEG fixtures (`sample.jpg`, `orientation.jpg`, `no_metadata.jpg`, plus the two issue
344 files) are all 1-component grayscale, so no test ever saw the ExifTool `File:YCbCrSubSampling`
tag that every 3-component JPEG carries after metadata removal. None is a photograph; every
identifying value is an obviously synthetic string.

The bytes are committed and are never regenerated: CI and the Windows runner have none of the
tools below. The sha256 values pin the files; `tests/integration/jpeg_fixture_color_guard.test.ts`
parses the SOF marker of every committed JPEG and fails if the 4:2:0 or 4:4:4 colour file is lost.

| Field | Pinned value |
| --- | --- |
| macOS | 26.6.2, `sw_vers -productVersion` |
| cjpeg | libjpeg-turbo 3.1.4.1 (build 20260327) |
| ImageMagick | 7.1.1-44 Q16-HDRI aarch64 |
| Bundled ExifTool | 13.59 (`exiftool -ver`) |
| Generated | 2026-11-09 |

## Commands

```sh
magick -size 16x16 gradient:red-blue base.png
magick base.png ppm:- | cjpeg -sample 2x2 -progressive -quality 80 > color_420_progressive.jpg
magick base.png ppm:- | cjpeg -sample 1x1 -quality 80 > color_444.jpg
# seed synthetic identifying metadata into both files with the BUNDLED ExifTool:
.resources/nix/bin/exiftool -overwrite_original -Make=ExifCleaner-Fixture \
  -Model=ExifCleaner-Fixture-Model -Artist=ExifCleaner-Fixture-Artist \
  -GPSLatitude=37.7749 -GPSLatitudeRef=N -GPSLongitude=122.4194 -GPSLongitudeRef=W \
  -XMP-dc:Creator=ExifCleaner-Fixture-Creator <file>
```

## Per-fixture table

| File | Bytes | SHA-256 | `ColorComponents` | `YCbCrSubSampling` | `EncodingProcess` |
| --- | --- | --- | --- | --- | --- |
| `color_420_progressive.jpg` | 3,753 | `15c05370496467bc7311575bb5fc19a0dc5da77f2dd970077d41f23e91e0363f` | 3 | `YCbCr4:2:0 (2 2)` | Progressive DCT, Huffman coding |
| `color_444.jpg` | 3,894 | `3bac8632ddfd8cc8f88a9b416b880fee984b45fd2eeda9eedd3bad67ba53e141` | 3 | `YCbCr4:4:4 (1 1)` | Baseline DCT, Huffman coding |

## Seeded tags (identifying, synthetic)

`IFD0:Make`, `IFD0:Model`, `IFD0:Artist`, `GPS:GPSLatitude(+Ref)`, `GPS:GPSLongitude(+Ref)`,
`XMP-dc:Creator`. The seed makes the strip non-vacuous: without it the zero-tag early exit
(`use_process_files.ts`) would hide the file from the copy path.

## Measured mechanism

`exiftool -all= -o - color_420_progressive.jpg | exiftool -G1 -s -YCbCrSubSampling -` prints
`[File] YCbCrSubSampling : YCbCr4:2:0 (2 2)`: the tag is derived from the SOF marker, is not
metadata that `-all=` can remove, and is reported by ExifTool in the `File` group.

## Phase 69-03 additions: colour PNG and colour WebP (OVR-01, D-22b)

Two more 16x16 colour fixtures, generated once from the same gradient and committed as bytes
(CI and the Windows runner have none of these tools). They feed the per-format colour sweep
(`tests/domain/copy_mode_color_sweep.test.ts`, `tests/domain/fixtures/copy_mode_color_sweep.json`).
The sweep rows record the sha256 of the measured input; the test re-hashes the committed file and
fails if the bytes drift from what was measured.

| Field | Pinned value |
| --- | --- |
| cwebp | 1.5.0 |
| ImageMagick | 7.1.1-44 Q16-HDRI aarch64 |
| Bundled ExifTool | 13.59 |
| Generated | 2026-11-09 |

```sh
magick -size 16x16 gradient:red-blue base.png
magick base.png PNG24:color_rgb.png                  # 8-bit RGB, not interlaced
cwebp -q 80 base.png -o color_lossy.webp              # lossy VP8
# seed synthetic identifying metadata with the BUNDLED ExifTool (both files):
.resources/nix/bin/exiftool -overwrite_original -Make=ExifCleaner-Fixture \
  -Model=ExifCleaner-Fixture-Model -Artist=ExifCleaner-Fixture-Artist \
  -GPSLatitude=37.7749 -GPSLatitudeRef=N -GPSLongitude=122.4194 -GPSLongitudeRef=W \
  -XMP-dc:Creator=ExifCleaner-Fixture-Creator <file>
# the PNG additionally: -PNG:Comment=ExifCleaner-Fixture-Comment
```

| File | Bytes | SHA-256 | Colour facts (bundled ExifTool) |
| --- | --- | --- | --- |
| `color_rgb.png` | 1,266 | `a44bc4c9c8a5bca65f327498cbc119e8c1c8658ac984f536069282833b29ff50` | `PNG:ColorType` RGB, 8-bit, `Noninterlaced`; ImageMagick also wrote `cHRM` and `bKGD` chunks, which the PNG allowlist already permits |
| `color_lossy.webp` | 3,246 | `97dab56eeff6216483842aaef3d5294e9422b578020ad86ad66b63ca320c18e5` | `File:FileType` Extended WEBP, `RIFF:WebP_Flags` XMP, EXIF, lossy VP8 |

Seeded (identifying, synthetic) in both: `IFD0:Make`, `IFD0:Model`, `IFD0:Artist`,
`GPS:GPSLatitude(+Ref)`, `GPS:GPSLongitude(+Ref)`, `XMP-dc:Creator`; the PNG also carries
`PNG:Comment`. The WebP allowlist is not part of this plan (the WebP leak check is plan 69-09);
the WebP rows of the sweep are measured and recorded only.

## Phase 69-03 additions: colour JPEG and PNG with an embedded ICC profile

`color_icc_p3.jpg` and `color_icc_p3.png` are copies of `color_420_progressive.jpg` and
`color_rgb.png` with one ICC profile embedded. The `p3` in the name is the label the plan gave the
files; the embedded profile is NOT Display P3. It is the profile extracted from the already
committed `red-at-12-oclock-with-color-profile-lossy.avif` (`ProfileDescription` ColorSpin, ICC
v2.1.0, sRGB-class matrix/TRC, no `chad` and no `bkpt` tag), so no third-party profile bytes enter
the repository. They keep the seeded synthetic identifying metadata of their sources.

```sh
# profile extracted with the bundled ExifTool (written to a scratch directory, not the fixtures dir):
.resources/nix/bin/exiftool -icc_profile -b red-at-12-oclock-with-color-profile-lossy.avif > colorspin.icc
cp color_420_progressive.jpg color_icc_p3.jpg && cp color_rgb.png color_icc_p3.png
.resources/nix/bin/exiftool -overwrite_original -icc_profile\<=colorspin.icc color_icc_p3.jpg color_icc_p3.png
```

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `color_icc_p3.jpg` | 4,245 | `7afbd1d2e1c44ed93f9c6a43e3da2bf2c154d7c7dc3909f3d32bc2009af41ef6` |
| `color_icc_p3.png` | 1,538 | `df117b3355b4df2833ed51b12d4c0ce9ac929ddd0b2e67dfa55e5cba299719d9` |

The profiles with `chad`, `bkpt`, `meas`, `view`, `lumi`, `tech`, `dmnd`, `dmdd` and `vued` tags
(the macOS system sRGB IEC61966-2.1, Adobe RGB (1998) and Display P3 profiles) were embedded in
scratch copies only and measured through both engines; their bytes are never committed. Only the
resulting key names are in `tests/domain/fixtures/copy_mode_color_sweep.json` (rows `icc-*`).
