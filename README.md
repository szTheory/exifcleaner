# ExifCleaner

>Cross-platform desktop app to clean image metadata.

<img src="static/icon.png" height=250 alt="ExifCleaner Logo">

## Install

*macOS 10.10+, Linux, and Windows 7+ are supported (64-bit only).*

**macOS**

[**Download**](https://github.com/szTheory/exifcleaner/releases/latest) the `.dmg` file.

**Linux**

[**Download**](https://github.com/szTheory/exifcleaner/releases/latest) the `.AppImage` or `.deb` file.

*The AppImage needs to be [made executable](http://discourse.appimage.org/t/how-to-make-an-appimage-executable/80) after download.*

**Windows**

[**Download**](https://github.com/szTheory/exifcleaner/releases/latest) the `.exe` file.


---

## Links

* [Official Website](https://exifcleaner.com)
* [Issue Tracker](https://github.com/szTheory/exifcleaner/issues)

---

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
```

After Travis finishes building your app, open the release draft it created and click "Publish".
