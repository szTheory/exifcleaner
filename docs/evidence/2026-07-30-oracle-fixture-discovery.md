# Oracle Fixture Discovery Transcript

Date: 2026-07-30
Bundled ExifTool: `exifcleaner-electron/.resources/nix/bin/exiftool` 13.50
App flow: Electron `file-open-add-files`, then ExifTool `-G1 -s -json` readback

Result: blocked. `issue240` and `orientation` reproduced, but `issue217` and `issue255` did not reproduce through the real app path. Per `20-02-PLAN.md`, no JSON manifest was written because not all four contracts are reproduced.

## #217

Status: not reproduced
Media kind: MP4
Synthetic output basename: `issue217.mp4`
SHA-256 after app processing: `6f29446e230456ad204890d1ac3b3e67f2232a195bde675445f3d1fa080be91f`

Generator argv:

```text
node sourceXtraMp4(): create sample.mp4 from deterministic fixture seed, replace Microsoft Xtra GUID Source
```

Attempted commands and construction notes:

- `-Keys:Source=oracle-source-217` failed: `Keys:Source` is not writable.
- `-UserData:Source=oracle-source-217` failed: `UserData:Source` is not writable.
- `-ItemList:Source=oracle-source-217` failed: `ItemList:Source` is not writable.
- `-Microsoft:Source=oracle-source-217` failed: `Microsoft:Source` is not writable.
- `-Source=oracle-source-217` writes XMP `Source`, but the current strip path removes it.
- A Microsoft Xtra GUID entry for `{668CDFA5-7A1B-4323-AE4B-E527393A1D81} 100` produced a real `Microsoft:Source` before app processing.

Before app processing, relevant tags:

```json
{
  "Microsoft:Source": "oracle-source-217",
  "ItemList:Artist": "Test Author",
  "ItemList:Title": "Test Video",
  "XMP-dc:Title": "Test Video",
  "XMP-tiff:Artist": "Test Author"
}
```

After app processing, relevant tags:

```json
{}
```

Residual verdict: failed to reproduce. Exact residual key `Source` was not present after app processing.

## #240

Status: reproduced
Media kind: MP4
Synthetic output basename: `issue240.mp4`
SHA-256 after app processing: `60391e9b4851c6e36c749de1959f6ab646e2631f5436c21a4046a885080e5428`

Generator argv:

```text
node movieHeaderMp4(): create deterministic ftyp/moov/mvhd/tkhd/mdhd MP4
```

Before app processing, relevant tags:

```json
{
  "QuickTime:CreateDate": "2019:10:02 00:49:04",
  "Track1:TrackCreateDate": "2019:10:02 00:49:04",
  "Track1:MediaCreateDate": "2019:10:02 00:49:04"
}
```

After app processing, relevant tags:

```json
{
  "QuickTime:CreateDate": "2019:10:02 00:49:04",
  "Track1:TrackCreateDate": "2019:10:02 00:49:04",
  "Track1:MediaCreateDate": "2019:10:02 00:49:04"
}
```

Residual verdict: reproduced. Observed family members: `CreateDate`, `TrackCreateDate`, `MediaCreateDate`.

## #255

Status: not reproduced
Media kind: JPEG
Synthetic output basename: `issue255.jpg`
SHA-256 after app processing: `9be4d89d940423ad023c1bc5bd86e52abb124eef5ffcc1780d19baf960ea1e33`

Generator argv:

```text
-overwrite_original -XResolution=144 -YResolution=144 -ResolutionUnit=inches
```

Before app processing, relevant tags:

```json
{
  "JFIF:XResolution": 144,
  "JFIF:YResolution": 144,
  "IFD0:XResolution": 144,
  "IFD0:YResolution": 144
}
```

After app processing, relevant tags:

```json
{}
```

Residual verdict: failed to reproduce. Exact residual keys `XResolution` and `YResolution` were not present after app processing.

## Orientation

Status: reproduced
Media kind: JPEG
Synthetic output basename: `orientation.jpg`
SHA-256 after app processing: `c600cf6f9906a7aba37e33064d863fbfba1459f971d87c61031371728cce4f59`

Generator argv:

```text
-overwrite_original -Orientation#=6
```

Before app processing, relevant tags:

```json
{
  "IFD0:Orientation": "Rotate 90 CW"
}
```

After app processing with `preserveOrientation: true`, relevant tags:

```json
{
  "IFD0:Orientation": "Rotate 90 CW"
}
```

Residual verdict: reproduced. The exact orientation value `Rotate 90 CW` survives when preservation is enabled.

## Blocker

`20-02-PLAN.md` requires all four entries to be reproduced before writing `2026-07-30-oracle-fixture-discovery.json`. It also explicitly forbids substituting sample media, inventing metadata, weakening D-07, or creating downstream issue markers when #217 or #240 cannot be reproduced. Because #217 did not reproduce, the manifest is intentionally omitted and the phase must halt for replanning or human decision.
