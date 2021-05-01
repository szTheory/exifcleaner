# Changelog

## 3.5.0 - 5 May 2021



## 3.4.0 - 19 Oct 2020

### Features

- Huge speed increase for file processing, especially when batch processing many files with multiple CPUs (more efficient process pool algorithm, better integration with exiftool process keep-alive)
- Multilingual support with translations for French, Polish, Japanese, Spanish (Spain), German, and Portuguese (Brazil)
- Mac/Windows: show progress in dock when batch processing files
- Linux: fix app icon in dock
- Linux: dark mode works with Ubuntu

### Bug Fixes

- Linux: fix issue where icon.png was not found on startup with .deb installs

### Infrastructure

- Upgrade to Electron 10
- Upgrade to exiftool 12.08
- Add update_exiftool.pl Perl script to automate pulling down latest ExifTool binaries and verifying their checksums
- Remove a bunch of NPM dependencies

