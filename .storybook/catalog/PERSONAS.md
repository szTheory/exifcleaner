<!-- Generated from catalog.json by .storybook/catalog/catalog.mjs. Do not edit: edit catalog.json and run yarn catalog:write. -->

# Personas and jobs

GitHub issues are the only inbound channel, so every claim marked confirmed comes from a person who filed one.

People file issues when something fails: confirmed over-weights failure and says nothing about prevalence, so no claim here says how many people hold it.

CI checks issue sources by format only; authorship (user or maintainer) was checked once at plan time with gh api, and a moved author needs the same check again.

## Core job

Remove what my files say about me, without surprises, and let me see what changed.

- [confirmed] remove: Users reported or asked about identifying data: geolocation fields, the PC name and user name, face tags, and the user name and project name from a design tool. (issues #366, #108, #132, #347, by user)
- [confirmed] no-surprises: Users reported surprises after cleaning: photos rotated, print resolution reset, a modified original with Save as copy on, a changed modification date. (issues #168, #209, #234, #255, #304, #250, by user)
- [confirmed] see-changes: Users asked to see what was removed and were unsure when the count read 0. (issues #207, #361, by user)
- [confirmed] wording: The sentence is the brand book's job statement, pinned at the recorded commit. (brand 7629b8f, Positioning and values)

## Batch cleaners (P-batch)

- [assumed] trigger: Has a folder or a large set to clean in one sitting. (brand 7629b8f, Batch cleaners)
- [confirmed] need: Users asked for whole folders and sub-folders, and for multiple files at once. (issues #18, #171, #139, by user)
- [proposal] need: After a large batch, finding the results and telling cleaned from failed files is a need the maintainer's own issues describe. (issues #316, #317, by maintainer)
- [proposal] stakes: One failure hides among hundreds of successes. (maintainer 2026-11-10, MILESTONE-GUIDE.md, Who we serve, item 4)

Red flags:

- [proposal] RF-batch-1 (never-happen): One failed file stops, or is hidden among, the rest of the batch. (brand 7629b8f, Batch cleaners)
- [proposal] RF-batch-2 (never-happen): A batch summary that counts already-clean and failed files the same way, so the two cannot be told apart. (maintainer 2026-11-10, research/v5.0-catalog-foundation.md (unverified inventory item))
- [proposal] RF-batch-3 (never-happen): Rows that cannot be told apart: long or duplicate names, no folder context. (issues #316, #317, by maintainer)

## Photographers (P-photographer)

- [assumed] trigger: Has RAW, TIFF or print files whose masters must come out as they went in, minus the private fields. (brand 7629b8f, Photographers)
- [confirmed] need: Users reported print resolution reset to 96, RAF files that would not open after cleaning, and asked to keep only the colour profile or the modification date. (issues #255, #241, #266, #250, by user)
- [confirmed] need: Preserve resolution is a shipped setting. (string settings.preserveResolution.label)
- [confirmed] need: Preserve color profile is a shipped setting. (string settings.preserveColorProfile.label)
- [confirmed] need: Preserve orientation is a shipped setting. (string settings.preserveOrientation.label)
- [confirmed] need: Preserve modification date is a shipped setting. (string settings.preserveTimestamps.label)
- [proposal] stakes: A master that is damaged, or silently altered, is lost work. (maintainer 2026-11-10, MILESTONE-GUIDE.md, Who we serve, item 3)

Red flags:

- [confirmed] RF-photographer-1 (never-happen): A cleaned RAW file that no longer opens, or an original modified while Save as copy is on. (issues #241, #304, by user)
- [proposal] RF-photographer-2 (never-happen): A preserve setting reported as kept when the field was not kept (resolution, colour, HDR gain map). (issues #396, by maintainer)

## Sharers (P-sharer)

- [assumed] trigger: Has a photo or file about to be posted, sent or sold. (brand 7629b8f, Sharers)
- [confirmed] need: Users reported photos rotated or flipped after cleaning, and two asked for the rotation to be kept. (issues #168, #209, #234, by user)
- [confirmed] need: A user dropped an image and saw nothing happen, in two reports. (issues #256, #257, by user)
- [confirmed] context: One user described themselves as not very tech-oriented. (issues #217, by user)
- [proposal] stakes: If the tool misleads, the file leaves with its metadata still inside. (maintainer 2026-11-10, PROJECT.md core value)

Red flags:

- [confirmed] RF-sharer-1 (never-happen): A cleaned photo comes back rotated or flipped by default. (issues #168, #209, #234, by user)
- [confirmed] RF-sharer-2 (never-happen): A dropped image that shows nothing on screen. (issues #256, #257, by user)
- [confirmed] RF-sharer-3 (never-say): Copy that uses fear to sell, naming what could happen to a person instead of what is removed. (brand 7629b8f, Inclusive language, and writing for translation)

## Sources and journalists (P-source)

- [assumed] trigger: Has a file whose origin or location would identify someone, and must hand it over or publish it. (brand 7629b8f, Sources and journalists)
- [confirmed] need: Users reported identifying fields they expected gone: location, PC and user name, face tags, design-tool author and project. (issues #366, #108, #132, #347, by user)
- [confirmed] need: Users reported what a cleaning left behind (PDF, AVIF) and files the app could not verify. (issues #216, #215, #405, #406, by user)
- [confirmed] context: Users questioned the app's network and permission behaviour: a firewall prompt, a location-access question. (issues #116, #298, by user)
- [confirmed] context: The app promises no network access, no telemetry and no automatic updates, and its code is open to check. (brand 7629b8f, Key messages)
- [assumed] stakes: A false clean result is worse than a visible failure, because the file is shared believing the data is gone. (maintainer 2026-11-10, MILESTONE-GUIDE.md, Who we serve, item 2)
- [assumed] context: No issue in the tracker (213 read on 2026-11-11) is filed by someone who says they are a journalist or a source; this persona's existence rests on the brand book. (no source)

Red flags:

- [confirmed] RF-source-1 (never-happen): A cleaned file that still carries an identifying field, such as a user name or a PC name. (issues #108, #347, by user)
- [confirmed] RF-source-2 (never-say): Claims the app cannot prove, such as secure, anonymous or untraceable. (brand 7629b8f, How to write our name)
- [confirmed] RF-source-3 (never-happen): A PDF that still holds metadata after cleaning. (issues #216, by user)
- [proposal] RF-source-4 (never-happen): A failed-file message that does not say the original is unchanged. (string writeFailedSummary)
- [confirmed] RF-source-5 (never-say): Absolute promises the app cannot prove, such as one hundred percent secure or guaranteed. (brand 7629b8f, Voice: this, not that)

## Jobs

### J-01

When I am about to post, send or sell a file, I want what it says about me gone before it leaves my hands, so I can share it without giving away more than I meant.

Personas: P-sharer, P-source

- [confirmed] evidence: Users asked about removing location, PC name and user name, and face data. (issues #366, #108, #132, by user)

### J-02

When I clean a file I care about, I want the things I rely on, such as which way it faces, how its colour reads and how large it prints, to stay as they were, so it works in my other tools afterwards and I do not repair it by hand.

Personas: P-photographer, P-sharer

- [confirmed] evidence: Users reported rotation and resolution lost after cleaning and asked for options to keep rotation, resolution and the colour profile. (issues #209, #234, #255, #266, by user)

### J-03

When a file has been cleaned, I want to see exactly what was removed and what remains, so I can trust the result without checking it another way.

Personas: P-photographer, P-sharer, P-source

- [confirmed] evidence: Users asked for the full list of removed metadata and were unsure about a count of 0. (issues #207, #361, by user)

### J-04

When a file could not be cleaned, or the result could not be checked, I want to be told plainly which file and what state it is in, so I never believe a file is clean when it is not.

Personas: P-batch, P-source

- [confirmed] evidence: Users reported files the app could not verify, and cleaning that failed outright. (issues #405, #406, #344, by user)

### J-05

When I am not sure a cleaning will go right, I want my original kept exactly as it was, so I can try again or go back.

Personas: P-batch, P-photographer

- [confirmed] evidence: Users asked for a copy instead of an overwrite and reported an original modified with Save as copy on. (issues #124, #218, #304, by user)

### J-06

When I have a whole folder or a large set to clean, I want to hand it over once and get through all of it, so I am not cleaning file by file.

Personas: P-batch

- [confirmed] evidence: Users asked for folders, sub-folders and multi-file drops. (issues #18, #171, #139, by user)

### J-07

When a large run finishes or is under way, I want to see which files are cleaned, which failed and which need a look, and to find the results, so I know what to do next without opening each file.

Personas: P-batch

- [proposal] evidence: The maintainer's own jobs list for results and output folders; no user report yet. (issues #316, #317, by maintainer)

### J-08

When I hand the app personal or sensitive files, I want to know it stays on my computer and sends nothing out, so I can use it for files I could not upload anywhere.

Personas: P-source

- [confirmed] evidence: Users questioned the app's outbound connection and location access. (issues #116, #298, by user)

### J-09

When I open the app for the first time with a file in hand, I want one obvious thing to do and a result I can see, so I get the file cleaned without help.

Personas: P-sharer

- [confirmed] evidence: Users reported seeing nothing after a drop, and one reported that the app did not work and asked for help. (issues #256, #257, #252, by user)
