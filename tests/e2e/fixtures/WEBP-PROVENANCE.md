# WebP Shape Fixture Provenance

Seven tiny (16x16) WebP fixtures (Phase 69-08, WEBP-08, D-03, D-04). They exist because the only
committed WebP files before them were `sample.webp` (1x1, EXIF + ICC) and `color_lossy.webp`
(69-03, lossy with EXIF/XMP). Native default WebP copy mode (exifcleaner-node 0.5.0) is leak-checked
as `required` in 69-09, and its allowlist must come from the shapes users actually have: lossless
(VP8L), lossy with alpha, animated, ICC-only, XMP-only, EXIF-plus-identifying, and a truncated file.
None is a photograph; every identifying value is an obviously synthetic string.

The bytes are committed and are never regenerated: CI and the Windows runner have none of the tools
below. The sha256 values pin the files; the sweep rows
(`tests/domain/fixtures/copy_mode_webp_sweep.json`) record the sha256 of each measured input and
`tests/domain/copy_mode_webp_sweep_data.test.ts` re-hashes the committed bytes.

| Field | Pinned value |
| --- | --- |
| macOS | 26.6.2 (`sw_vers -productVersion`) |
| libwebp tools (`cwebp`, `img2webp`, `webpmux`, `webpinfo`) | 1.5.0 |
| ImageMagick | 7.1.1-44 Q16-HDRI aarch64 |
| Bundled ExifTool | 13.59 (`exiftool -ver`) |
| Generated | 2026-11-10 |

## Commands

```sh
magick -size 16x16 gradient:red-blue base.png
cwebp -q 80 base.png -o lossy.webp                                    # scratch only (VP8, no VP8X)
cwebp -lossless base.png -o webp_lossless.webp                        # VP8L
# alpha: a real 16-level alpha ramp (gradient used as the opacity channel), 8-bit RGBA PNG
magick -size 16x16 gradient:red-blue \( -size 16x16 gradient:white-black -colorspace Gray \) \
  -alpha off -compose CopyOpacity -composite PNG32:alpha.png
cwebp -q 80 -alpha_q 90 alpha.png -o webp_alpha.webp                  # VP8X + ALPH + VP8
magick -size 16x16 gradient:blue-red f2.png
img2webp -d 100 -lossy -q 80 base.png f2.png -o webp_animated.webp    # VP8X + ANIM + 2 x ANMF
# ICC: the profile bytes come from the committed sample.webp (the same bytes as the committed
# webp-oracle-profile.icc, `cmp` identical); no new profile source
webpmux -get icc tests/e2e/fixtures/sample.webp -o nikon.icc
webpmux -set icc nikon.icc lossy.webp -o webp_icc.webp
# XMP: a small hand-written packet carrying only dc:creator
webpmux -set xmp x.xmp lossy.webp -o webp_xmp.webp
# identifying: lossy plus EXIF and XMP written with the BUNDLED ExifTool
cp lossy.webp webp_identifying.webp
.resources/nix/bin/exiftool -overwrite_original -Make=ExifCleaner-Fixture \
  -Model=ExifCleaner-Fixture-Model -Artist=ExifCleaner-Fixture-Artist \
  -Software=ExifCleaner-Fixture-Software -Orientation#=6 -IFD0:XResolution=300 \
  -IFD0:YResolution=300 -IFD0:ResolutionUnit=inches -GPSLatitude=37.7749 -GPSLatitudeRef=N \
  -GPSLongitude=122.4194 -GPSLongitudeRef=W -XMP-dc:Creator=ExifCleaner-Fixture-Creator \
  webp_identifying.webp
# truncated: the first 60 percent of the identifying file (cut inside the XMP chunk)
head -c $((3352 * 60 / 100)) webp_identifying.webp > webp_truncated.webp
```

## Per-fixture table

| File | Bytes | SHA-256 | Chunks (`webpinfo`) | Bundled ExifTool facts |
| --- | --- | --- | --- | --- |
| `webp_lossless.webp` | 82 | `16c2d4e1edfbd4e49e4497e2df421d675a3a2aa9b221d1b1ef88645e86766dfb` | `VP8L` only (no VP8X) | `File:FileType` `WEBP (lossless)`, `RIFF:AlphaIsUsed` `No`, no `RIFF:WebP_Flags` |
| `webp_alpha.webp` | 162 | `b55950d0fd11da3f5f9ae283e76e4e12533ba04abcc3581d221e7137443f274d` | `VP8X` (alpha 1), `ALPH`, `VP8` | `Extended WEBP`, `RIFF:WebP_Flags` `Alpha`, `AlphaPreprocessing`, `AlphaFiltering`, `AlphaCompression` |
| `webp_animated.webp` | 238 | `37cfa0a561821b3448eb0c028ba5979f648953e2c5e1841d73f15577870d3329` | `VP8X` (animation 1), `ANIM`, 2 x `ANMF` each with `VP8` | `Extended WEBP`, `RIFF:WebP_Flags` `Animation`, `BackgroundColor`, `AnimationLoopCount` `inf`, `Duration` `0.20 s` |
| `webp_icc.webp` | 598 | `ddfa8dc760e96ebed0cc3945390e7f7569afaffb1309cc5b6022c8fd792fde5d` | `VP8X` (ICCP 1), `ICCP`, `VP8` | `RIFF:WebP_Flags` `ICC Profile`, `ICC_Profile:ProfileDescription` `Nikon Adobe RGB 4.0.0.3000` |
| `webp_xmp.webp` | 480 | `a03d893915fa4a12667cbe974a8e5082c12f1f76d7acfe086231fe838e98c83e` | `VP8X` (XMP 1), `VP8`, `XMP` | `RIFF:WebP_Flags` `XMP`, `XMP-dc:Creator` |
| `webp_identifying.webp` | 3,352 | `b90d96fd82c5b810e48f0237199d1397862700dba29378524d5691de8a4e68f5` | `VP8X` (EXIF 1, XMP 1), `VP8`, `EXIF`, `XMP` | `RIFF:WebP_Flags` `XMP, EXIF`, `IFD0:Make/Model/Artist/Software/Orientation/XResolution/YResolution/ResolutionUnit`, `GPS:*`, `XMP-dc:Creator` |
| `webp_truncated.webp` | 2,011 | `cc795271156a7803ff8688c6601e54700fe700e9b2208affee393c991a56abce` | cut inside the XMP chunk; `webpinfo` reports `Errors detected.` | ExifTool still reads the header and the EXIF block (`RIFF:WebP_Flags` `XMP, EXIF`, `IFD0:Make`) |

## Measured note: no frame count tag

The plan asked for an ExifTool frame count. ExifTool 13.59 reports no `FrameCount` for
`webp_animated.webp` (`exiftool -s3 -FrameCount` prints nothing, exit 0); it reports `Duration`
(`0.20 s`) and `AnimationLoopCount`. The frame count (2) is established with `webpinfo` (two `ANMF`
chunks), which is what the committed fixture check uses.

## Seeding at sweep time

The seven fixtures above are committed as-is. The sweep (69-WEBP-SWEEP-MATRIX.md) additionally
plants the shared synthetic identifying seed (`tests/helpers/heif_seed.ts`, `HEIF_SEED_ARGS`) into
temporary copies of the lossless, alpha, animated, ICC, XMP and lossy fixtures with the bundled
ExifTool, so the strip is non-vacuous for every shape. Seeded variants are never committed
(`seedHeifCopy` refuses the fixtures directory).
