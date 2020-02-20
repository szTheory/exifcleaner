# <img src="static/icon.png" height=27 alt="ExifCleaner Logo"> ExifCleaner

> Desktop app to clean image and video metadata.

![ExifCleaner demo](https://user-images.githubusercontent.com/28652/71770980-f04e8b80-2f2b-11ea-90f1-4393ec57adc0.gif)

## Benefits

- Fast
- Drag & Drop
- Free and open source (MIT)
- Windows, Mac, and Linux
- PNG, JPG, and TIFF support
- Also works for video files such as MP4
- Batch-processing
- Multi-core support
- Dark mode (automatic)

## Downsides

- Executable size `~190MB` (Electron app)
- Memory usage `~120MB` (Electron app)

---

## Install

**Windows**

[**Download**](https://github.com/szTheory/exifcleaner/releases/latest) the `.exe` file.

_macOS 10.10+, Linux, and Windows 7+ are supported (64-bit only)._

**macOS**

[**Download**](https://github.com/szTheory/exifcleaner/releases/latest) the `.dmg` file.

**Linux**

[**Download**](https://github.com/szTheory/exifcleaner/releases/latest) the `.AppImage` or `.deb` file.

_The AppImage needs to be [made executable](http://discourse.appimage.org/t/how-to-make-an-appimage-executable/80) after download._

## Links

- [Official Website](https://exifcleaner.com)
- [Source Code](https://github.com/szTheory/exifcleaner)
- [Issue Tracker](https://github.com/szTheory/exifcleaner/issues)

## Development

Built with [Electron](https://electronjs.org). Uses [node-exiftool](https://www.npmjs.com/package/node-exiftool) as a wrapper for [Exiftool](https://exiftool.org/) binaries.

### Run

```
$ npm install
$ npm run dev #this command is set up to give you HMR in dev
```

### Contributing

This app is mostly feature complete. I want to keep it simple and not add a bunch of bloat to it. And I want to avoid release churn. That said, there are a couple small features that might be worth adding. And there are a few minor bugs or points of cleanup that would be worth polishing. If you'd like to help check out the [Issue Tracker](https://github.com/szTheory/exifcleaner/issues) which contains an exhaustive list of known issues. Just pick one and submit a Pull Request or leave a comment and I can provide guidance or help if you need it. Make sure to test the app out to see if it still works though. There isn't much going on this app so it should be easy enough to do. I might add some automated tests later on to help with this. For now it's just been me working on the app so manual testing has worked out fine.

### Publish

```
$ npm run release
$ npm run dist
```

Or instead of `npm run dist`, after Travis finishes building your app, open the release draft it created and click "Publish".
