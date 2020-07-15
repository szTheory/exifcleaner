# <img src="static/icon.svg" height=26> ExifCleaner

![Version](https://img.shields.io/github/v/release/szTheory/exifcleaner) ![Total Downloads](https://img.shields.io/github/downloads/szTheory/exifcleaner/total)

> Desktop app to clean metadata from images, videos, PDFs, and other files.

![ExifCleaner demo](https://user-images.githubusercontent.com/28652/71770980-f04e8b80-2f2b-11ea-90f1-4393ec57adc0.gif)

## Benefits

- Fast
- Drag & Drop
- Free and open source (MIT)
- Windows, Mac, and Linux
- Supports popular image formats such as PNG, JPG, GIF, and TIFF
- Supports popular video formats such as M4A, MOV, and MP4
- Supports PDF documents
- Batch-processing
- Multi-core support
- Dark mode (automatic)
- No automatic updates or network traffic
- Relatively few NPM dependencies (no JS frameworks)

## Drawbacks

- Executable size `~200MB` (Electron app)
- Memory usage `~120MB` (Electron app)

## Install

Linux, macOS 10.10+, and Windows 7+ are supported (64-bit only).

- **Linux**: [Download the .AppImage or .deb file](https://github.com/szTheory/exifcleaner/releases/latest)
- **macOS**: [Download the .dmg file](https://github.com/szTheory/exifcleaner/releases/latest)
- **Windows**: [Download the .exe file](https://github.com/szTheory/exifcleaner/releases/latest)

For Linux, The AppImage needs to be [made executable](https://discourse.appimage.org/t/how-to-make-an-appimage-executable/80) after download.

## Links

- [Official Website](https://exifcleaner.com)
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

Pull down the latest ExifTool binaries:

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

### Contributors

Thanks to all the people who submitted bug reports and fixes. I've tried to include everyone, so if I've missed you it was by accident, let me know and I'll add you. Also see the [Translations list](https://github.com/szTheory/exifcleaner#translations) for more credits.

- @m1chu - Polish translation, fix for Mac dock bug on non-Mac platforms, help debugging Unicode filename bug
- @LukasThyWalls - help debugging Unicode filename bug, feature suggestions
- @AKKED - Japanese translation, help debugging Unicode filename bug
- @TomasGutierrez0 - help auditing ExifTool dependency
- @5a384507-18ce-417c-bb55-d4dfcc8883fe - help debugging initial Linux version
- @totoroot - help debugging Linux AppImage installer, usability feedback, feature suggestions
- @Scopuli - help debugging Linux AppImage installer
- @Tox86 - found broken Settings menu item bug

### Publishing a new release

This section is really for my own reference when publishing a new release.

Bump the version with `release`:

```bash
yarn run release
```

When the Github release page comes up, mark it as draft. Then run the publish command:

```bash
yarn run publish
```

Once you're happy with the release and want to finalize it, remove the draft flag on the Github releases page.

## Translations

Here is the status of all translations:

- French ❌ needs review
- Japanese ✅ by @AKKED
- Polish ✅ by @m1chu

New translations and corrections to existing translations are welcome! See the instructions below.

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
3. Then update the `strings.json` file as mentioned above, and quit the program and relaunch it to see your changes. When you're finished, commit your changes from the command line with for example `git commit -am "Finished adding translations"`. Then run `git push origin master`, and go to the project URL your forked it to (for example https://github.com/myusernamehere/exifcleaner` and click the button to open a new Pull Request.

Let me know if you run into any issues, I can guide you through the process if you get stuck.
