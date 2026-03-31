# GitHub Context

Last updated: Feb 2025. Last release: v3.6.0 (May 4, 2021). Last commit: March 2022.

## Open PRs (8)

### Dependabot Bumps (4)

- **#267** Bump lodash 4.17.21 → 4.17.23
- **#265** Bump electron 11.4.10 → 35.7.5 (will not work without build system migration)
- **#263** Bump tmp 0.2.1 → 0.2.4
- **#259** Bump pbkdf2 3.1.2 → 3.1.3

### Translations (3)

- **#258** Persian translations (from RamtinA, Feb 2025)
- **#239** Catalan translation (from marcarmengou, Jul 2023)
- **#206** Croatian locale strings (from milotype, Apr 2022) — note: Croatian was already merged in PR #155, this may be an update

### CI

- **#174** GitHub Actions CI (from PolpOnline, Sep 2021) — owner reviewed positively but never merged. Includes exiftool download caching. The Prettier config was fixed in a separate merged PR #177.

## Open Issues by Category (64 total)

### Bugs (8)

| Issue | Title | Platform |
| --- | --- | --- |
| #255 | Downgrades PPI/DPI | — |
| #241 | RAF files corrupt | — |
| #215 | AVIF metadata not fully removed | — |
| #217 | Removing Source data from MP4 files (Mac) | Mac |
| #211 | Drag and drop not working Fedora 36 AppImage | Linux |
| #199 | Better cleaning of TIFF files | — |
| #194 | LargeFileSupport error with larger files | — |
| #83 | Occasional "Exiftool process is not open" error | Windows |

### Enhancements — High Priority (4)

| Issue | Title | Labels |
| --- | --- | --- |
| #247 | Add ESM node module support | high priority |
| #244 | Change language from the menu | enhancement, high priority |
| #236 | Update ExifTool | high priority |
| #86 | Remove extended filesystem attributes (xattr/mdls) | enhancement, high priority, mac |

### Enhancements — Features (16)

| Issue | Title |
| --- | --- |
| #266 | Remove all tags except Colour Profile/Colour Space |
| #264 | WebP support |
| #250 | Preserve file modification date/time |
| #249 | Drag images to program shortcut |
| #242 | AI metadata removal support |
| #234 | Option to not strip image rotation metadata |
| #218 | Save as a new file |
| #209 | Keep landscape/portrait rotation metadata option |
| #207 | Clearly show full list of removed metadata |
| #182 | Replace Metadata for MKV Files |
| #172 | "New Releases" menu item linking to GitHub releases |
| #171 | Remove metadata for items inside a folder |
| #170 | Open/show file after processing |
| #167 | View Exif data removed/remaining diff |
| #166 | "Always on top" option |
| #162 | Office file metadata cleaning |
| #124 | Save as new file (duplicate of #218) |
| #121 | RTL languages support |
| #114 | Keep original filesystem created-at timestamp |
| #106 | Remove hover tooltip transparency in dark mode |

### Platform & DevOps (10)

| Issue | Title | Platform |
| --- | --- | --- |
| #261 | Portable version filename should say "portable" | Windows |
| #254 | .rpm package does not open | Linux |
| #208 | Add to Pacstall repository | Linux |
| #198 | Universal app for Apple Silicon | Mac |
| #189 | Update macOS Big Sur icon | Mac |
| #186 | Add to Chocolatey package repository | Windows |
| #181 | Add Snapcraft support | Linux |
| #175 | 32-bit Windows support | Windows |
| #141 | Release checksum not generated for Linux RPM | Linux |
| #134 | Can't install on Mac Big Sur (permissions) | Mac |
| #89 | Flatpak distribution for Linux | Linux |

### Context Menu Integration (2)

| Issue | Title |
| --- | --- |
| #165 | Right-click context menu integration (CLI params) |
| #161 | Add context menu support |

### Translations (2)

| Issue | Title |
| --- | --- |
| #156 | Use online translation platform |
| #185 | Open app localized |

### Documentation & Questions (5)

| Issue | Title |
| --- | --- |
| #262 | VirusTotal false alarm |
| #257 | Image shows nothing on drop (#256 duplicate) |
| #252 | ExifCleaner doesn't work |
| #238 | GPU process isn't usable error |
| #225 | Does not work on M1 Mac |
| #235 | ExifCleaner as web app? |
| #240 | Remove date fields in MP4 files |

### Other

| Issue | Title |
| --- | --- |
| #231 | Cannot read subdirectories | Windows |
| #229 | Program exit after timeline | — |
| #228 | App system abort timeline | Mac |
| #216 | PDF metadata leftovers | — |
| #164 | Dark mode not working Windows 7 | Windows |
| #139 | Can't drag multiple files Windows 10 | Windows |
| #116 | Firewall sees outbound connection | Windows |
| #111 | Linearize PDFs for better metadata removal | — |
| #91 | Fix source-map-support stack traces | DevOps |

## Key Community Themes

- **"Is this project dead?"** — Issues #246 and #251 directly ask. Owner responded in Jan 2024 saying they'd update "this year" after Electron added ESM support.
- **Security urgency** — Electron 11 has known Chromium vulnerabilities. ExifTool needs updating. Users report VirusTotal flags (#262).
- **Rotation metadata** — Multiple users (#209, #234, #168) report images flipping after EXIF removal because orientation tag is stripped.
- **Folder support** — Users want to drop folders and process all files recursively (#171, #231).
- **Save as copy** — Users want option to save cleaned file separately instead of overwriting (#218, #124).
- **Package managers** — Requests for Chocolatey (#186), Flatpak (#89), Snapcraft (#181), Pacstall (#208).
- **PDF limitations** — PDF metadata removal is inherently partial per exiftool limitations (#111, #216).

## Recently Merged PRs (notable)

- **#205** Vietnamese translation (Mar 2022)
- **#202** Czech translation (Mar 2022)
- **#196** Malayalam translation (Feb 2022)
- **#193** ExifTool download caching for CI (Jan 2022)
- **#191** Swedish translation (Jan 2022)
- **#184** Hungarian translation (Nov 2021)
- **#178** Link contributor GitHub accounts in README (Sep 2021)
- **#177** Fix Prettier to use tabs (Sep 2021)
- **#159** Upgrade NPM dependencies (Jul 2021)
- **#158** Remove Spectre.css and node-sass (Jul 2021) — replaced with plain CSS + CSS variables
- **#160** Upgrade to Electron 13 + remove electron-webpack — **CLOSED, NOT MERGED** (blocked by ESM issues)

## Release History

20 releases from v1.2.0 (Dec 2019) to v3.6.0 (May 2021). Rapid early development, then slowed to translations-only commits.

| Version | Date | Key Changes |
| --- | --- | --- |
| 3.6.0 | May 2021 | XSS + remote shell security fix |
| 3.5.1 | May 2021 | Windows portable build |
| 3.5.0 | May 2021 | ExifTool CVE fix, M1 support, Electron 11 |
| 3.4.0 | Oct 2020 | Multi-core speed boost, i18n, Electron 10 |
| 3.3.1 | Jul 2020 | JS → TypeScript migration, Electron 9 |
| 3.2.0 | Apr 2020 | Linux fixes, File→Open menu |
| 3.0.0 | Jan 2020 | Disable auto-update, ESM removal |
