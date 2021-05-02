# <img src="static/icon.svg" height=26> ExifCleaner

![Version](https://img.shields.io/github/v/release/szTheory/exifcleaner) ![Total Downloads](https://img.shields.io/github/downloads/szTheory/exifcleaner/total)

> Desktop app to clean metadata from images, videos, PDFs, and other files.

![ExifCleaner demo](https://user-images.githubusercontent.com/28652/71770980-f04e8b80-2f2b-11ea-90f1-4393ec57adc0.gif)

## !!!!! NOTE - UPGRADE TO 3.5.0 OR GREATER ASAP !!!!!

If you are running 3.4.0 or earlier of ExifCleaner, update immediately! A security vulnerability was found in exiftool, the command-line application that powers ExifCleaner under the hood, and this was updated in ExifCleaner 3.5.0.

## Benefits

- Fast
- Drag & Drop
- Free and open source (MIT)
- Windows, Mac, and Linux
- Supports popular image formats such as PNG, JPG, GIF, and TIFF
- Supports popular video formats such as M4A, MOV, and MP4
- Supports PDF documents\* (partial, [see discussion](https://github.com/szTheory/exifcleaner/issues/111))
- Batch-processing
- Multi-core support
- Dark mode (automatic)
- No automatic updates or network traffic
- Multi-language support
- Relatively few NPM dependencies (no JS frameworks)

## Drawbacks

- Executable size `~200MB` (Electron app)
- Memory usage `~120MB` (Electron app)
- PDF metadata removal is only partial ([see discussion](https://github.com/szTheory/exifcleaner/issues/111))
- Does not remove extended filesystem attributes ([see discussion](https://github.com/szTheory/exifcleaner/issues/86))

## Download and Install

Linux, macOS 10.10+, and Windows 7+ are supported (64-bit only).

- **Linux**: [Download the .AppImage, .deb, or .rpm file](https://github.com/szTheory/exifcleaner/releases/latest)
- **macOS**: [Download the .dmg file](https://github.com/szTheory/exifcleaner/releases/latest)
- **Windows**: [Download the .exe file](https://github.com/szTheory/exifcleaner/releases/latest)

For Linux, The AppImage needs to be [made executable](https://discourse.appimage.org/t/how-to-make-an-appimage-executable/80) after download.

Arch Linux users can install the app from the AUR using an AUR helper (such as `yay` or `paru`):

```bash
paru -S exifcleaner-bin
```

## Links

- [Official Website](https://exifcleaner.com)
- [Download](https://github.com/szTheory/exifcleaner/releases)
- [Source Code](https://github.com/szTheory/exifcleaner)
- [Issue Tracker](https://github.com/szTheory/exifcleaner/issues)
- [Translations file](https://github.com/szTheory/exifcleaner/blob/master/.resources/strings.json)

## Supported File Types

Below is a full list of supported file types that ExifCleaner will remove metadata for. It's based on which file types [ExifTool](https://exiftool.org/) supports write operations for.

- **3G2, 3GP2** – 3rd Gen. Partnership Project 2 a/v (QuickTime-based)
- **3GP, 3GPP** – 3rd Gen. Partnership Project a/v (QuickTime-based)
- **AAX** – Audible Enhanced Audiobook (QuickTime-based)
- **AI, AIT** – Adobe Illustrator [Template] (PS or PDF)
- **ARQ** – Sony Alpha Pixel-Shift RAW (TIFF-based)
- **ARW** – Sony Alpha RAW (TIFF-based)
- **AVIF** – AV1 Image File Format (QuickTime-based)
- **CR2** – Canon RAW 2 (TIFF-based) (CR2 spec)
- **CR3** – Canon RAW 3 (QuickTime-based) (CR3 spec)
- **CRM** – Canon RAW Movie (QuickTime-based)
- **CRW, CIFF** – Canon RAW Camera Image File Format (CRW spec)
- **CS1** – Sinar CaptureShop 1-shot RAW (PSD-based)
- **DCP DNG** – Camera Profile (DNG-like)
- **DNG** – Digital Negative (TIFF-based)
- **DR4** – Canon DPP version 4 Recipe
- **DVB** – Digital Video Broadcasting (QuickTime-based)
- **EPS, EPSF, PS** – [Encapsulated] PostScript Format
- **ERF** – Epson RAW Format (TIFF-based)
- **EXIF** – Exchangeable Image File Format metadata (TIFF-based)
- **EXV** – Exiv2 metadata file (JPEG-based)
- **F4A, F4B, F4P, F4V** – Adobe Flash Player 9+ Audio/Video (QuickTime-based)
- **FFF** – Hasselblad Flexible File Format (TIFF-based)
- **FLIF** – Free Lossless Image Format
- **GIF** – Compuserve Graphics Interchange Format
- **GPR** – GoPro RAW (DNG-based)
- **HDP, WDP, JXR** – Windows HD Photo / Media Photo / JPEG XR (TIFF-based)
- **HEIC, HEIF** – High Efficiency Image Format (QuickTime-based)
- **ICC, ICM** – International Color Consortium color profile
- **IIQ** – Phase One Intelligent Image Quality RAW (TIFF-based)
- **IND, INDD, INDT** – Adobe InDesign Document/Template
- **INSP** – Insta360 Picture (JPEG-based)
- **JP2, JPF, JPM, JPX** – JPEG 2000 image [Compound/Extended]
- **JPEG, JPG, JPE** – Joint Photographic Experts Group image
- **LRV** – Low-Resolution Video (QuickTime-based)
- **M4A, M4B, M4P, M4V** – MPEG-4 Audio/Video (QuickTime-based)
- **MEF** – Mamiya (RAW) Electronic Format (TIFF-based)
- **MIE** – Meta Information Encapsulation (MIE specification)
- **MOS** – Creo Leaf Mosaic (TIFF-based)
- **MOV, QT** – Apple QuickTime Movie
- **MP4** – Motion Picture Experts Group version 4 (QuickTime-based)
- **MPO** – Extended Multi-Picture format (JPEG with MPF extensions)
- **MQV** – Sony Mobile QuickTime Video
- **NEF** – Nikon (RAW) Electronic Format (TIFF-based)
- **NRW** – Nikon RAW (2) (TIFF-based)
- **ORF** – Olympus RAW Format (TIFF-based)
- **PDF** – Adobe Portable Document Format
- **PEF** – Pentax (RAW) Electronic Format (TIFF-based)
- **PNG, JNG, MNG** – Portable/JPEG/Multiple-image Network Graphics
- **PPM, PBM, PGM** – Portable Pixel/Bit/Gray Map
- **PSD, PSB, PSDT** – PhotoShop Document / Large Document / Template
- **QTIF, QTI, QIF** – QuickTime Image File
- **RAF** – FujiFilm RAW Format
- **RAW** – Panasonic RAW (TIFF-based)
- **RW2** – Panasonic RAW 2 (TIFF-based)
- **RWL** – Leica RAW (TIFF-based)
- **SR2** – Sony RAW 2 (TIFF-based)
- **SRW** – Samsung RAW format (TIFF-based)
- **THM** – Thumbnail image (JPEG)
- **TIFF, TIF** – Tagged Image File Format
- **VRD** – Canon DPP Recipe Data
- **X3F** – Sigma/Foveon RAW
- **XMP** – Extensible Metadata Platform sidecar file

## File writer limitations

ExifCleaner has the same writer limitations as the underlying `exiftool` it depends on. Taken from the [official website](https://exiftool.org/#limitations):

- ExifTool will not rewrite a file if it detects a significant problem with the file format.
- ExifTool has been tested with a wide range of different images, but since it is not possible to test it with every known image type, there is the possibility that it will corrupt some files. Be sure to keep backups of your files.
- Even though ExifTool does some validation of the information written, it is still possible to write illegal values which may cause problems when reading the images with other software. So take care to validate the information you are writing.
- ExifTool is not guaranteed to remove metadata completely from a file when attempting to delete all metadata. For JPEG images, all APP segments (except Adobe APP14, which is not removed by default) and trailers are removed which effectively removes all metadata, but for other formats the results are less complete:
  - JPEG - APP segments (except Adobe APP14) and trailers are removed.
  - TIFF - XMP, IPTC, ICC_Profile and the ExifIFD are removed, but some EXIF may remain in IFD0. (The CommonIFD0 Shortcut tag is provided to simplify removal of common metadata tags from IFD0.)
  - PNG - Only XMP, EXIF, ICC_Profile and native PNG textual data chunks are removed.
  - PDF - The original metadata is never actually removed.
  - PS - Only XMP and some native PostScript tags may be deleted.
  - MOV/MP4 - Most top-level metadata is removed.
  - RAW formats - It is not recommended to remove all metadata from RAW images because this will likely remove some proprietary information that is necessary for proper rendering of the image.

## Translations

New translations and corrections to existing translations are welcome! See the [Adding a Translation](https://github.com/szTheory/exifcleaner/#adding-a-translation) section if there is a language you would like to add. Here is the current translations status:

- Arabic ✅ by @ZER0-X
- Chinese (Mandarin) ✅ by MarcusPierce
- Danish ✅ by @zlatco
- Dutch ✅ by @rvl-code
- French (France) ✅ by @NathanBnm (Nathan Bonnemains)
- French (Quebec) ❌ needs translation if France version is not sufficient
- German ✅ by @tayfuuun, with updates by @philippsandhaus
- Italian ✅ by @blackcat-917
- Japanese ✅ by @AKKED
- Polish ✅ by @m1chu
- Portuguese (Brazil) ✅ by @iraamaro, with updates by @dadodollabela
- Portuguese (Portugal) ❌ needs translation if Brazil version is not sufficient
- Russian ✅ by @likhner (Arthur Likhner)
- Spanish (Spain) ✅ by @ff-ss (Francisco)
- Spanish (Latin America) ❌ needs translation if Spain version is not sufficient
- Slovak ✅ by @LiJu09
- Ukranian ✅ by @hugonote (Alexander Berger)

## Verifying checksum of downloads from the Github releases page

Download the `latest.yml` (Windows), `latest-mac.yml` (Mac), or `latest-linux.yml` (Linux) file from the release page that corresponds to your operating system. Then run the following command to generate a sha checksum. ExifCleaner 3.5.0 is used here as an example.

On Mac, Linux, and on Windows using the Linux Subsystem for Windows:

```bash
sha512sum ExifCleaner-Setup-3.5.0.exe | cut -f1 -d\ | xxd -r -p | base64
```

The output should match the sha512 value in the latest.yml file for the version you downloaded. As of now there is no checksum generated for the Linux RPM version (appears to be an electron-build issue, see [Github issue here](https://github.com/szTheory/exifcleaner/issues/141)).

## Development

Built with [Electron](https://electronjs.org). Uses [node-exiftool](https://www.npmjs.com/package/node-exiftool) as a wrapper for [Exiftool](https://exiftool.org/) binaries. To see the current list of NPM dependencies, run:

```bash
yarn list --production
```

### Run the app in dev mode

Clone the repository and cd into the directory.

```bash
git clone https://github.com/szTheory/exifcleaner.git
cd exifcleaner
```

Next, install the NPM package dependencies.

```bash
yarn install
```

Pull down the latest ExifTool binaries (in Windows, run this within the Linux Subsystem for Windows):

```bash
yarn run update-exiftool
```

Finally, launch the application. This supports Hot Module Reload (HMR) so you will automatically see your changes every time you save a file.

```bash
yarn run dev
```

### Contributing

This app is mostly feature complete. I want to keep it simple and not add a bunch of bloat to it. And I want to avoid release churn. That said, there are a couple small features that might be worth adding. And there are a few minor bugs or points of cleanup that would be worth polishing. If you'd like to help check out the [Issue Tracker](https://github.com/szTheory/exifcleaner/issues) which contains an exhaustive list of known issues. Just pick one and submit a Pull Request or leave a comment and I can provide guidance or help if you need it. Make sure to test the app out to see if it still works though. There isn't much going on in this app so it should be easy enough to do. I might add some automated tests later on to help with this. For now it's just been me working on the app so manual testing has worked out fine.

TypeScript code is formatted using Prettier.

### Adding a Translation

Adding a translation is easy. All you have to do is go to [the translation list](https://github.com/szTheory/exifcleaner/blob/master/.resources/strings.json), click on "Edit this file", and add an entry for the new language underneath the other ones. So for example if you wanted to add a Spanish translation, where it says:

```json
"empty.title": {
  "en": "No files selected",
  "fr": "Aucun fichier sélectionné"
},
```

You just add a line for `"es"` (list of language codes [here](https://www.electronjs.org/docs/api/locales)) underneath the other ones:

```json
"empty.title": {
  "en": "No files selected",
  "fr": "Aucun fichier sélectionné",
  "es": "Spanish translation here"
},
```

and repeat that pattern for each of the entries. That's probably the easiest way to contribute. If you want to be able to see all of your translations working in a live app before submitting, you can also do this:

1. Fork the project on Github
2. Follow the directions [here](https://github.com/szTheory/exifcleaner#run-the-app-in-dev-mode) to get ExifCleaner running in development mode on your computer
3. Then update the `strings.json` file as mentioned above, and quit the program and relaunch it to see your changes. When you're finished, commit your changes from the command line with for example `git commit -am "Finished adding translations"`. Then run `git push origin master`, and go to the project URL your forked it to (for example <https://github.com/myusernamehere/exifcleaner>) and click the button to open a new Pull Request.

If you want to run the app with a specific locale without changing your system preferences, use one of the following commands with the correct language code. If you don't see your language listed below, just follow the pattern and plug in your own language code [from this list](https://www.electronjs.org/docs/api/locales).

```bash
yarn run dev --lang=en #English
yarn run dev --lang=fr #French
yarn run dev --lang=pl #Polish
yarn run dev --lang=ja #Japanese
yarn run dev --lang=es #Spanish
yarn run dev --lang=de #German
```

Let me know if you run into any issues, I can guide you through the process if you get stuck.

### Linux AppImage Notes

To mount the AppImage and inspect it's contents:

```bash
./ExifCleaner-x.y.z.AppImage --appimage-mount
```

Where `x.y.z` is the release version number

### Smoke test checklist for new releases

On all platforms:

- Linux
- Windows
- Mac

Perform the following manual tests before a release:

- Drag and drop hundreds of files
- File -> Open dialog
- Switch locale to each language and check translations
- Switch between light and dark mode
- Open "About" dialog

### Publishing a new release

This section is really for my own reference when publishing a new release.

Bump the version with `release` (choose a "pre" release for point releases for testing):

```bash
yarn run release
```

Check the [Github release page](https://github.com/szTheory/exifcleaner/releases) and confirm a new draft release was created. Then run the publish command:

```bash
yarn run publish
```

Once you're happy with the release and want to finalize it, remove the draft flag on the Github releases page.

### Contributors

Thanks to all the people who submitted bug reports and fixes. I've tried to include everyone so if I've missed you it was by accident, just let me know and I'll add you.

- @m1chu - Polish translation, fix for Mac dock bug on non-Mac platforms, help debugging Unicode filename bug
- @LukasThyWalls - help debugging Unicode filename bug, feature suggestions
- @AKKED - Japanese translation, help debugging Unicode filename bug
- @TomasGutierrez0 - help auditing ExifTool dependency
- @5a384507-18ce-417c-bb55-d4dfcc8883fe - help debugging initial Linux version
- @totoroot - help debugging Linux AppImage installer, usability feedback, feature suggestions
- @Scopuli - help debugging Linux AppImage installer
- @Tox86 - found broken Settings menu item bug
- @ff-ss (Francisco) - Spanish translation
- @tayfuuun - German translation
- @philippsandhaus - German translation fixes
- @airvue - Help debugging Ubuntu .deb package error
- @Goblin80 - Help debugging Ubuntu .deb package error
- @zahroc - Help diagnosing error when adding bulk directories
- @iraamaro - Portuguese (Brazil) translation. Fix for update_exiftool.pl when building from source on Debian and Slackware
- @LiJu09 - Slovak translation
- @likhner (Arthur Likhner) - Russian translation
- @hugonote (Alexander Berger) - Ukranian translation
- @dadodollabela - Portuguese (Brazil) translation fixes
- @zlatco - Danish translation
- @ZER0-X - Arabic translation
- @rvl-code - Dutch translation
- @blackcat-917 - Italian translation, Arch Linux distribution maintainer
- @NathanBnm (Nathan Bonnemains) - French translation
- @Dyrimon - Linux AppImage error notification fix
- @MarcusPierce - Chinese (Mandarin) translation
- @brandonlou - Heads up on updating exiftool to 12.24+ to mitigate [CVE-2021-22204 arbitrary code execution](https://twitter.com/wcbowling/status/1385803927321415687)
- @v4k0nd (Szabó Krisztián) - Help building instructions on verifying release checksums
- @papb - Help setting up Windows portable build
- @Bellisario - Help setting up Windows portable build
