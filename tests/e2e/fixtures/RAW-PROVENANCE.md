# RAW Fixture Provenance (CR2, DNG, CR3, RW2)

`CanonRaw.cr2`, `DNG.dng`, `CanonRaw.cr3` and `Panasonic.rw2` are ExifTool's own small test
images from its `t/images/` test corpus -- not full camera RAWs. They are vendored, then
seeded by `generateRawFixtures` (`tests/e2e/fixtures/generate_fixtures.ts`) with
`RAW_SEED_ARGS`, so the bytes committed to this repository are **seeded derivatives of the
upstream files, not upstream-identical** -- unlike `sample.raf` (`RAF-PROVENANCE.md`), which is
committed byte-for-byte unmodified. Their small, synthetic decoder tags (`Make`/`Model`,
DNG's calibration set) are sufficient to prove tag-identity and image-data-hash identity
(RMV-05 criterion 2), but "opens exactly as before" is proven by that tag+hash identity, not by
decoding through a RAW decoder.

## Shared fields

| Field | Value |
| --- | --- |
| Upstream project | [ExifTool](https://exiftool.org/) |
| Distribution | `Image-ExifTool-13.59.tar.gz` |
| Distribution SHA-256 | `668ea3acececb7235fbd0f4900e72d5f12c9b07e5c778fd36cb1e9b5828fd65a` (pinned in `update_exiftool.pl:134`, `CHECKSUMS_URL`) |
| Source license | Same upstream project and license as `sample.raf` (`RAF-PROVENANCE.md`) -- [GNU GPL-3.0](https://github.com/exiftool/exiftool/blob/master/LICENSE) |
| Bundled reader | ExifTool 13.59 |
| Local seeding mechanism | `generateRawFixtures` + `RAW_SEED_ARGS`, `tests/e2e/fixtures/generate_fixtures.ts` |
| `RAW_SEED_ARGS` (exact, order-pinned) | `-GPSLatitude=37.7749`, `-GPSLatitudeRef=N`, `-GPSLongitude=-122.4194`, `-GPSLongitudeRef=W`, `-IFD0:Artist=ZZP511-ARTIST`, `-IFD0:Software=ZZP511-SOFT`, `-IFD0:ImageDescription=ZZP511-DESC`, `-IFD0:Copyright=ZZP511-COPY`, `-IFD0:XPComment=ZZP511-XPCOMMENT`, `-IFD0:XPAuthor=ZZP511-XPAUTHOR`, `-IFD0:XPTitle=ZZP511-XPTITLE`, `-IFD0:XPSubject=ZZP511-XPSUBJECT`, `-IFD0:XPKeywords=ZZP511-XPKEYWORDS`, `-ExifIFD:UserComment=ZZP511-COMMENT`, `-ExifIFD:SerialNumber=ZZP511-BODYSN`, `-ExifIFD:LensSerialNumber=ZZP511-LENSSN`, `-ExifIFD:OwnerName=ZZP511-OWNER` |
| Regeneration command | `ASDF_NODEJS_VERSION=22.14.0 yarn tsx tests/e2e/fixtures/generate_fixtures.ts --output-dir <dir> --raw-upstream-dir exiftool_downloads/Image-ExifTool-13.59/t/images` |

## Per-fixture table

| Local filename | Original path | Upstream bytes | Upstream SHA-256 | Committed (seeded) bytes | Committed SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `CanonRaw.cr2` | `t/images/CanonRaw.cr2` | 8,724 | `b5d3d26f3c85bcb35a52515eac060e2e362161893504013589ffd9ad2e9b004b` | 9,012 | `a17c51b4a04f3eab2f276a5d44512a05b6d0237f21769fcd91b1415075431a59` |
| `DNG.dng` | `t/images/DNG.dng` | 13,662 | `daa9ce7a2c6923815390d8566254ef4d4a75d68d1531afdb264bd4b39a8dfd89` | 14,204 | `210f3b13106e4cca69ec16c393e3fe05bab41c86c5527ae3fc54f8764cdc250c` |
| `CanonRaw.cr3` | `t/images/CanonRaw.cr3` | 52,502 | `dc02aa55e277935b690879584e97c2d013f54d854afaec6f9d3274c99a918fd6` | 53,283 | `48ada5656150bc7a252a633183c86a835c8975686626d4e7ed1aab87111a2d43` |
| `Panasonic.rw2` | `t/images/Panasonic.rw2` | 12,344 | `431a1239713ce1bca8f0b422b9a094372246669432060e2a0a21d1fd2f761678` | 12,444 | `a350097624881ad0007474bd7d3c1d7408eb52cd2abd8018ffa21f57cd807fc6` |

Note on the `DNG.dng` upstream digest: the value transcribed into `51.1-02-PLAN.md`'s
`<interfaces>` table did not match a fresh `shasum -a 256` measurement of the vendored
`exiftool_downloads/Image-ExifTool-13.59/t/images/DNG.dng` taken during this plan's execution
(a documented transcription slip the plan itself instructed the executor to re-measure rather
than copy). The value above and in `generate_fixtures.ts`'s `RAW_FIXTURE_SPECS` is the
directly measured one, and is what `generateRawFixtures` verifies against before every seed
step (it throws on any mismatch).

## Not covered

Per D-47, `ARW`, `ORF`, `PEF` and `SRW` have no fixture in this repository -- no small,
redistributable, non-truncated sample was available in the bundled ExifTool 13.59 distribution.
`Nikon.nef` exists in the same upstream `t/images/` corpus but is a **truncated stub**
(`Undersized IFD0 StripByteCounts` on read) and is not used as a fixture for that reason -- using
it would prove nothing about the fix either way. `sample.raf` (`FujiFilm.raf`) keeps its own
provenance file, `RAF-PROVENANCE.md`; it is committed unmodified (not seeded) because, unlike
CR2/DNG/CR3/RW2, `.raf` is refused before the RAW deletion branch is ever reached
(`refuseUnsafeRafWrite`, `src/main/exif_handlers.ts`) -- there is no product code path to prove
against it, so there is no reason to seed it.
