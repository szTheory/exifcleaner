# Fujifilm RAF Fixture Provenance

`sample.raf` is a genuine Fujifilm RAW file. It is intentionally kept as a
small, redistributable test-data aggregate so the RAW forced-copy flow is
proved with real RAF bytes rather than extension-renamed data.

| Field | Pinned value |
| --- | --- |
| Upstream project | [ExifTool](https://github.com/exiftool/exiftool) |
| Upstream commit | [`2200871d9cef988051d2a99d67df3bda6cbb30a8`](https://github.com/exiftool/exiftool/commit/2200871d9cef988051d2a99d67df3bda6cbb30a8) |
| Original path and name | `t/images/FujiFilm.raf` |
| Source URL | `https://raw.githubusercontent.com/exiftool/exiftool/2200871d9cef988051d2a99d67df3bda6cbb30a8/t/images/FujiFilm.raf` |
| Source license | [GNU GPL-3.0](https://github.com/exiftool/exiftool/blob/2200871d9cef988051d2a99d67df3bda6cbb30a8/LICENSE) |
| Local filename | `sample.raf` |
| Size | 38,452 bytes |
| SHA-256 | `e12e30bd0cf5f160b82b93f043696c04d1d5f4628f1fdd19abdab9f8328d8bf0` |
| Bundled reader | ExifTool 13.50 |
| Required precondition | ExifTool reports `FileType=RAF` and `DateTimeOriginal=2007:05:22 13:58:30` before stripping. |

The executable assertions in `fixture_integrity.test.ts` verify the upstream
identity, the bundled reader version, RAF recognition, and removal of only the
pinned `DateTimeOriginal` tag from a temporary copy. They also re-hash the
source fixture after that operation, preventing tests from silently accepting a
mutated original.
