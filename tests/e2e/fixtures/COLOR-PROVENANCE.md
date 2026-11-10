# Colour JPEG Fixture Provenance

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
