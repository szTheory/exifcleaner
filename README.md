# <img src="static/icon.png" height=27 alt="ExifCleaner Logo"> ExifCleaner

>Desktop app to clean image metadata.

## Benefits

* Fast
* Drag & Drop
* Free and open source (MIT)
* Windows, Mac, and Linux
* PNG, JPG, and TIFF support
* Batch-processing
* Multi-core support
* Dark mode (automatic)
* Automatic updates

## Downsides

* Executable size `~190MB` (Electron app)
* Memory usage `~120MB` (Electron app)

---

## Install

**Windows**

[**Download**](https://github.com/szTheory/exifcleaner/releases/latest) the `.exe` file.

*macOS 10.10+, Linux, and Windows 7+ are supported (64-bit only).*

**macOS**

[**Download**](https://github.com/szTheory/exifcleaner/releases/latest) the `.dmg` file.

**Linux**

[**Download**](https://github.com/szTheory/exifcleaner/releases/latest) the `.AppImage` or `.deb` file.

*The AppImage needs to be [made executable](http://discourse.appimage.org/t/how-to-make-an-appimage-executable/80) after download.*


## Links

* [Official Website](https://exifcleaner.com)
* [Source Code](https://github.com/szTheory/exifcleaner/issues)
* [Issue Tracker](https://github.com/szTheory/exifcleaner/issues)

## Development

Built with [Electron](https://electronjs.org). Uses [node-exiftool](https://www.npmjs.com/package/node-exiftool) as a wrapper for [Exiftool](https://exiftool.org/) binaries.

### Run

```
$ npm install
$ npm start
```

### Publish

```
$ npm run release
$ npm run dist
```

Or instead of `npm run dist`, after Travis finishes building your app, open the release draft it created and click "Publish".
