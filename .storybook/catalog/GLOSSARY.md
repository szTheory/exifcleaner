<!-- Generated from glossary.json by .storybook/catalog/catalog.mjs. Do not edit: edit glossary.json and run yarn catalog:write. -->

# Glossary

## In the product

**appearance**:
Whether the app looks light or dark, or follows the system.

**clean**:
The result of removing metadata: a cleaned file or a cleaned copy.
_Avoid_: destroy, nuke

**cleaned copy**:
A new file with the metadata removed, saved next to the original, which stays unchanged.
_Avoid_: output

**clipboard**:
Where copied text goes. The app confirms with Copied to clipboard.

**cloud sync client**:
An app such as a cloud drive that keeps a folder in sync and can change a file while it is cleaned.

**drop zone**:
The area where files are dropped to start cleaning.

**ExifCleaner**:
The app's name, written as one word with the capitals shown.
_Avoid_: exif cleaner

**fields**:
The individual items of metadata, such as a camera model or a place. Say fields to people; tags only in technical detail.
_Avoid_: attribute, attributes, info, tag, tags

**file**:
Anything dropped or chosen to clean: an image, a video or a PDF.

**file results**:
The table of files with their name, type, size and metadata before and after cleaning.

**folder**:
A folder whose supported files are cleaned together. Scanning counts them first.

**group**:
A set of related fields shown together, such as Camera, Location or Time.

**in place**:
Cleaning the file itself instead of making a copy. The original is replaced.

**language**:
The language the app is shown in. System follows the language of the computer.

**macOS attributes**:
Extra data macOS keeps on a file outside its contents, such as where it was downloaded from.

**metadata**:
Information stored inside a file, such as camera, location, author and time details.
_Avoid_: exif data

**no network access** (reserved):
Brand claim: the app makes no network requests while it cleans. Not used in any string yet.
_Avoid_: offline mode, online mode

**open source** (reserved):
Brand claim: the code is public and open to inspection. Not used in any string yet.
_Avoid_: free software, free software project

**orientation**:
Which way up a photo is shown. Preserving it keeps photos upright after metadata removal.

**original**:
The file you added, before cleaning. It stays unchanged when a cleaned copy is made.
_Avoid_: input, source file

**preserve**:
Keep a kind of data when metadata is removed, such as orientation or the color profile.

**remove**:
Take metadata out of a file. Exact, never dramatic.
_Avoid_: scrub, wipe

**resolution**:
The DPI an image is printed at. Preserving it keeps prints the right size.

**reveal**:
Show a file in the file manager.

**Save as copy**:
The setting that writes a cleaned copy and leaves the original unchanged.
_Avoid_: back up, backup, duplicate

**settings**:
The preferences that control how files are cleaned.

**sorted**:
The order of the table, shown as Sorted ascending or Sorted descending.

**stays on your computer** (reserved):
Brand claim: files are cleaned on this computer and are not sent anywhere. Not used in any string yet.
_Avoid_: anonymous, secure, untraceable

**supported files**:
Files in a format ExifCleaner can clean. Other files are skipped and counted.

**modification date**:
When a file was last changed, as the file system records it. Not the date a photo was taken.

**unchanged**:
The original was not altered. Say it whenever a run fails or finds nothing to remove.
_Avoid_: untouched

**verify**:
Check that a cleaned file no longer holds the metadata that was removed.

**write**:
Save the cleaned file to disk.

## Technical detail only

**Exif**:
A common metadata format in photos. Say metadata unless you mean Exif itself.

**ICC profile**:
Color-management data embedded in an image. Preserving it keeps colors accurate.

## Owned by the OS

**download origin**:
The record macOS keeps of where a downloaded file came from.

**file manager**:
Finder or File Explorer, named for what it does. The OS owns the real name.

**Finder tags**:
Labels a person adds to a file in the Finder. macOS owns the name.

## Internal term to UI label

| internal | ui_label | avoid | surfaces | status | reviewed |
| --- | --- | --- | --- | --- | --- |
| outputPath | cleaned copy | output | en:reveal.cleanedCopy | canonical | 2026-11-12 |
| preserveTimestamps | modification date |  | en:settings.preserveTimestamps.label | canonical | 2026-11-12 |
| removeXattrs | macOS attributes |  | en:settings.removeXattrs.label | canonical | 2026-11-12 |
| removedFields | fields | attribute, attributes, info, tag, tags | en:metadata.removed.other | canonical | 2026-11-12 |
| saveAsCopy | Save as copy | back up, backup, duplicate | en:settings.saveAsCopy.label | canonical | 2026-11-12 |
| themeMode | appearance |  | en:appearance | canonical | 2026-11-12 |
| wasForcedCopy | Save as copy | back up, backup, duplicate | en:settings.saveAsCopy.label | canonical | 2026-11-12 |
| xattr | macOS attributes |  | en:settings.removeXattrs.label | canonical | 2026-11-12 |
