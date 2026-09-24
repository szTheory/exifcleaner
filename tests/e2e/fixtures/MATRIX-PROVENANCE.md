# Resolution Matrix Fixture Provenance

Seven fixtures for the FID-03 negative-control matrix (Phase 52-04, D-37), vendored unmodified
from the same upstream corpus `RAW-PROVENANCE.md` and `RAF-PROVENANCE.md` already use. Unlike
the RAW fixtures, these are committed byte-identical to upstream -- no seed is written into the
committed file. Seeds are applied at test time to temporary copies and re-read before use, so no
committed fixture here carries a Phase 52 seed.

| Field | Pinned value |
| --- | --- |
| Upstream project | [ExifTool](https://github.com/exiftool/exiftool) |
| Upstream distribution | ExifTool 13.59 (bundled with this repo) |
| Distribution SHA-256 | the same `exiftool_downloads/Image-ExifTool-13.59` archive `RAW-PROVENANCE.md` pins |
| Original path | `t/images/<Name>` (see table below) |
| Source license | [GNU GPL-3.0](https://github.com/exiftool/exiftool/blob/master/LICENSE) / Perl terms |
| Bundled reader | ExifTool 13.59 |

## Per-fixture table

| Local name | Upstream path | Bytes | SHA-256 (committed == upstream) | `-FileType` |
| --- | --- | --- | --- | --- |
| `GIF.gif` | `t/images/GIF.gif` | 2,321 | `55f8d30ea6fac980f35d5af11a90b10ddc0186d961b0273e66df2f8b7c5aa6be` | GIF |
| `QuickTime.heic` | `t/images/QuickTime.heic` | 623 | `4e1785e9924600d0274176f52609a2d514481877103b91c714bd2088ea803ae7` | HEIF |
| `QuickTime.mov` | `t/images/QuickTime.mov` | 3,871 | `eea529609b6026e0cd7b3d9188b997889f905cd89a93421ad7a9063c670449ec` | MOV |
| `BMP.bmp` | `t/images/BMP.bmp` | 1,142 | `fab182ec28064483847443e29982d592b64d7019fc4f1db85e02501a40e1dcf8` | BMP |
| `XMP.svg` | `t/images/XMP.svg` | 2,071 | `1e6449dc39a0e61bc9a4d27beaef5e68bc72fc59c6bf1772d174fd34f5f400c2` | SVG |
| `RIFF.avi` | `t/images/RIFF.avi` | 1,262 | `7c03b77d115118e3293833e6c1b5d5795c998051d145674368e0b97f02719d4b` | AVI |
| `ASF.wmv` | `t/images/ASF.wmv` | 12,379 | `c3cafee199bbf19bb2fdce56211d44d108454ea7efd8ecc7c4cdda7ebce87c97` | WMV |

## Renamed at test time

`QuickTime.mov` is copied and renamed to `.mp4`, `.m4v` and `.3gp` at test time by
`materializeRow` (`tests/helpers/resolution_matrix.ts`), and each rename's `-FileType` is
asserted before use (D-37 honest synthesis: ExifTool independently reports `MP4`, `M4V` and
`3GP` respectively for the renamed copies). `sample.mp4` -- the generator's own synthesized MP4
fixture -- is used for the `.mp4` matrix row instead of a `QuickTime.mov` rename, since it
already exists and already reports `MP4`.

`.jpeg`, `.tiff` and `.heif` rows are renamed copies of `sample.jpg`, `sample.tif` and
`QuickTime.heic` respectively, each `-FileType`-asserted before use.

## Not covered

Per D-37, the following formats are explicitly out of scope for this matrix, not silently
skipped:

- **AVIF** -- a renamed `QuickTime.heic` reports `-FileType HEIF`, not AVIF (measured), so
  renaming an existing fixture is not an honest AVIF write-path proof. No redistributable AVIF
  sample exists in this corpus.
- **ARW, ORF, PEF, SRW** -- no redistributable sample exists in the bundled ExifTool
  `t/images/` corpus.
- **NEF** -- the vendored stub in this corpus is truncated (`Undersized IFD0 StripByteCounts`);
  a write fails without `-m` and proves nothing (see 52-CONTEXT.md D-34).

RAW rows (`.cr2`, `.cr3`, `.dng`, `.rw2`, `.raf`) belong to phase 52-05, which reuses the
existing `RAW-PROVENANCE.md`/`RAF-PROVENANCE.md` fixtures and writes the whole-extension
coverage ledger.

The executable assertions in `fixture_integrity.test.ts` verify each committed digest and size
against the upstream pin, confirm `-FileType`, and confirm each extension is classified
`binary` in git.
