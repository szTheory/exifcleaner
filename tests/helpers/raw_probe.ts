// Phase 51.1 (RMV-05): the single RAW assertion module reused by this plan's e2e spec, the
// negative control (51.1-03) and the residue pin (51.1-04). Plain Node -- synchronous
// execFileSync, no @playwright/test or vitest import -- so both a Playwright *.spec.ts and a
// Vitest *.test.ts can call it identically.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export function readRawTags(
	filePath: string,
	exiftoolPath: string,
	options?: { numeric?: boolean },
): Record<string, unknown> {
	// -G3:1 (not -G1 alone): embedded documents -- the RW2 JpgFromRaw preview, the CR3
	// metadata track -- get a "DocN:" prefix under -G3, so the main image's IFD0:Make never
	// collides with an embedded copy's IFD0:Make under JSON duplicate-key suppression.
	const args = ["-a", "-G3:1", "-s", "-json"];
	if (options?.numeric === true) args.push("-n");
	args.push(filePath);
	const output = execFileSync(exiftoolPath, args).toString();
	const parsed = JSON.parse(output) as unknown;
	if (!Array.isArray(parsed) || parsed.length !== 1) {
		throw new Error(`Expected one ExifTool result for ${filePath}`);
	}
	const first = parsed[0];
	if (first === null || typeof first !== "object" || Array.isArray(first)) {
		throw new Error(`Expected ExifTool object result for ${filePath}`);
	}
	return first as Record<string, unknown>;
}

// The full class of tags RAW_IDENTIFYING_TAG_DELETES (plus its QuickTime-date sibling)
// targets, named without a group prefix so retainedIdentifyingKeys can match any group a
// given fixture happens to report the tag under.
export const RAW_IDENTIFYING_TAG_NAMES = [
	"Artist",
	"Software",
	"ImageDescription",
	"Copyright",
	"XPComment",
	"XPAuthor",
	"XPTitle",
	"XPSubject",
	"XPKeywords",
	"UserComment",
	"SerialNumber",
	"LensSerialNumber",
	"OwnerName",
	"CameraSerialNumber",
	"OriginalRawFileName",
	"RawDataUniqueID",
	"InternalSerialNumber",
	"ImageUniqueID",
	"DateTimeOriginal",
	"CreateDate",
	"ModifyDate",
	"OffsetTime",
	"OffsetTimeOriginal",
	"OffsetTimeDigitized",
	"SubSecTime",
	"SubSecTimeOriginal",
	"SubSecTimeDigitized",
	"TrackCreateDate",
	"TrackModifyDate",
	"MediaCreateDate",
	"MediaModifyDate",
	"TimeZone",
	"TimeZoneCity",
	"DaylightSavings",
	"TimeStamp",
] as const;

// Every key whose tag name (text after the last colon) is in RAW_IDENTIFYING_TAG_NAMES or
// starts with "GPS", whose value is not the empty string and not the EXIF zero-date, and
// which is not in allowlist -- sorted. Names keys, never counts (D-26 precedent).
export function retainedIdentifyingKeys(
	tags: Record<string, unknown>,
	allowlist: readonly string[],
): string[] {
	const allow = new Set(allowlist);
	const names = new Set<string>(RAW_IDENTIFYING_TAG_NAMES);
	return Object.keys(tags)
		.filter((key) => {
			if (allow.has(key)) return false;
			const groupPrefix = key.includes(":")
				? key.slice(0, key.indexOf(":"))
				: "";
			const tagName = key.includes(":")
				? key.slice(key.lastIndexOf(":") + 1)
				: key;
			const isIdentifying = names.has(tagName) || groupPrefix.startsWith("GPS");
			if (!isIdentifying) return false;
			const value = tags[key];
			if (value === "") return false;
			if (value === "0000:00:00 00:00:00") return false;
			return true;
		})
		.sort();
}

// Throws naming the key if any key is absent from sourceTags (vacuity guard -- the assertion
// must prove the source actually carried the tag before claiming the output lost it).
// Returns, in input order, each key whose output value is absent or not deep-equal to the
// source value.
export function decoderTagMismatches(
	sourceTags: Record<string, unknown>,
	outputTags: Record<string, unknown>,
	keys: readonly string[],
): string[] {
	const mismatches: string[] = [];
	for (const key of keys) {
		if (!(key in sourceTags)) {
			throw new Error(
				`decoderTagMismatches vacuity guard: source is missing decoder key ${key}`,
			);
		}
		const sourceValue = sourceTags[key];
		const outputValue = outputTags[key];
		if (
			!(key in outputTags) ||
			JSON.stringify(outputValue) !== JSON.stringify(sourceValue)
		) {
			mismatches.push(key);
		}
	}
	return mismatches;
}

export function readImageDataHash(
	filePath: string,
	exiftoolPath: string,
): string {
	const output = execFileSync(exiftoolPath, [
		"-api",
		"ImageHashType=SHA256",
		"-ImageDataHash",
		"-s3",
		filePath,
	])
		.toString()
		.trim();
	if (!/^[0-9a-f]{64}$/.test(output)) {
		throw new Error(
			`Expected a 64-hex-char SHA-256 -ImageDataHash for ${filePath}, got "${output}"`,
		);
	}
	return output;
}

// ExifTool stores the XP* tags (XPComment, XPAuthor, XPTitle, XPSubject, XPKeywords) as
// UTF-16LE, not latin1/ASCII -- a byte search must check both encodings or it silently misses
// half the seeded sentinels.
export function findSentinelBytes(
	filePath: string,
	sentinels: readonly string[],
): string[] {
	const raw = readFileSync(filePath);
	const latin1 = raw.toString("latin1");
	const utf16le = raw.toString("utf16le");
	return sentinels.filter(
		(sentinel) => latin1.includes(sentinel) || utf16le.includes(sentinel),
	);
}

export const RAW_SENTINELS = [
	"ZZP511-ARTIST",
	"ZZP511-SOFT",
	"ZZP511-DESC",
	"ZZP511-COPY",
	"ZZP511-XPCOMMENT",
	"ZZP511-XPAUTHOR",
	"ZZP511-XPTITLE",
	"ZZP511-XPSUBJECT",
	"ZZP511-XPKEYWORDS",
	"ZZP511-COMMENT",
	"ZZP511-BODYSN",
	"ZZP511-LENSSN",
	"ZZP511-OWNER",
] as const;

// Phase 51.1-03 (D-44 blast-radius differential): the offset tags a fixture's decoder needs
// to locate image data. These are excluded from tagLineDifferential's `changed` bucket
// (their numeric value moves whenever the file layout moves, which is expected and not part
// of the fix's tag-removal footprint) but are still required present on both sides -- a
// vanished offset tag would mean the decoder can no longer find the pixel data at all.
export const OFFSET_TAG_NAMES = [
	"StripOffsets",
	"TileOffsets",
	"ThumbnailOffset",
	"PreviewImageStart",
	"JpgFromRawStart",
	"RawDataOffset",
	"MediaDataOffset",
] as const;

export interface RawTagLine {
	readonly key: string;
	readonly value: string;
}

// Parses `exiftool -a -G3:1 -s -n --System:all` output: one `[Group] Tag : value` line per
// tag, duplicates preserved in file order (never deduplicated -- a second same-named tag in
// an embedded document is a real, separate line). Throws on any line that doesn't match the
// expected shape, rather than silently dropping it, so a future ExifTool output-format change
// surfaces as a loud failure instead of a quietly incomplete tag-line list.
export function readRawTagLines(
	filePath: string,
	exiftoolPath: string,
): RawTagLine[] {
	const output = execFileSync(exiftoolPath, [
		"-a",
		"-G3:1",
		"-s",
		"-n",
		"--System:all",
		filePath,
	]).toString();
	const lineRe = /^\[([^\]]+)]\s+(\S+)\s+:\s?(.*)$/;
	const lines: RawTagLine[] = [];
	for (const raw of output.split(/\r?\n/)) {
		if (raw.length === 0) continue;
		const match = lineRe.exec(raw);
		if (match === null) {
			throw new Error(
				`readRawTagLines: unparseable ExifTool line for ${filePath}: ${JSON.stringify(raw)}`,
			);
		}
		const group = match[1];
		const tag = match[2];
		const value = match[3];
		if (group === undefined || tag === undefined || value === undefined) {
			throw new Error(
				`readRawTagLines: incomplete match for ${filePath}: ${JSON.stringify(raw)}`,
			);
		}
		lines.push({ key: `${group}:${tag}`, value });
	}
	return lines;
}

function tagNameOf(key: string): string {
	return key.includes(":") ? key.slice(key.lastIndexOf(":") + 1) : key;
}

function groupLinesByKey(lines: readonly RawTagLine[]): Map<string, string[]> {
	const map = new Map<string, string[]>();
	for (const { key, value } of lines) {
		const existing = map.get(key);
		if (existing) {
			existing.push(value);
		} else {
			map.set(key, [value]);
		}
	}
	return map;
}

export interface TagLineDifferential {
	readonly removed: string[];
	readonly added: string[];
	readonly changed: { key: string; value: string }[];
}

// Multiset comparison by key: a key present before and absent after is `removed`; absent
// before and present after is `added`; present on both sides with a different sorted value
// multiset is `changed` (offset-tag keys excluded from `changed` per OFFSET_TAG_NAMES, but
// still required present on both sides -- a key that vanishes entirely is caught by
// `removed`, never silently treated as a benign offset move).
export function tagLineDifferential(
	before: readonly RawTagLine[],
	after: readonly RawTagLine[],
): TagLineDifferential {
	const beforeMap = groupLinesByKey(before);
	const afterMap = groupLinesByKey(after);
	const removed: string[] = [];
	const added: string[] = [];
	const changed: { key: string; value: string }[] = [];

	const allKeys = new Set<string>([...beforeMap.keys(), ...afterMap.keys()]);
	for (const key of Array.from(allKeys).sort()) {
		const beforeValues = beforeMap.get(key);
		const afterValues = afterMap.get(key);
		const isOffset = (OFFSET_TAG_NAMES as readonly string[]).includes(
			tagNameOf(key),
		);

		if (beforeValues !== undefined && afterValues === undefined) {
			removed.push(key);
			continue;
		}
		if (beforeValues === undefined && afterValues !== undefined) {
			added.push(key);
			continue;
		}
		if (beforeValues !== undefined && afterValues !== undefined) {
			if (isOffset) continue;
			const sortedBefore = [...beforeValues].sort();
			const sortedAfter = [...afterValues].sort();
			const same =
				sortedBefore.length === sortedAfter.length &&
				sortedBefore.every((value, index) => value === sortedAfter[index]);
			if (!same) {
				changed.push({ key, value: afterValues[0] ?? "" });
			}
		}
	}
	return { removed, added, changed };
}

// The single per-fixture table the e2e spec (this plan), the negative control (51.1-03) and
// the residue pin (51.1-04) all import, so the three can never drift apart.
export const RAW_CASES = [
	{
		fixture: "CanonRaw.cr2",
		decoderKeys: ["IFD0:Make", "IFD0:Model"],
		residueAllowlist: ["Canon:SerialNumber"],
		sourceIdentifyingKeys: [
			"IFD0:Artist",
			"ExifIFD:UserComment",
			"GPS:GPSLatitude",
		],
		imageDataHash:
			"d3304d1033409471ca0273565fc2244c3dcae35b1d4cfbd5d1d3b546ad55b729",
	},
	{
		fixture: "DNG.dng",
		decoderKeys: [
			"IFD0:Make",
			"IFD0:Model",
			"IFD0:UniqueCameraModel",
			"IFD0:LocalizedCameraModel",
			"IFD0:DNGVersion",
			"IFD0:DNGBackwardVersion",
			"IFD0:ColorMatrix1",
			"IFD0:ColorMatrix2",
			"IFD0:CameraCalibration1",
			"IFD0:CameraCalibration2",
			"IFD0:AnalogBalance",
			"IFD0:AsShotNeutral",
			"IFD0:BaselineExposure",
			"IFD0:CalibrationIlluminant1",
			"IFD0:CalibrationIlluminant2",
			"SubIFD:CFAPattern2",
			"SubIFD:BlackLevel",
			"SubIFD:WhiteLevel",
			"SubIFD:DefaultCropOrigin",
			"SubIFD:DefaultCropSize",
			"SubIFD:ActiveArea",
		],
		residueAllowlist: [],
		sourceIdentifyingKeys: [
			"IFD0:Artist",
			"IFD0:CameraSerialNumber",
			"IFD0:RawDataUniqueID",
			"GPS:GPSLatitude",
		],
		imageDataHash:
			"a5d9ce3239ccd1a3fd6c754cf0687adc001e9c1a76eaf5629ea5254b84ffe36d",
	},
	{
		fixture: "CanonRaw.cr3",
		decoderKeys: ["IFD0:Make", "IFD0:Model"],
		// Measured this session (-a -G3:1): the Track4 TimeStamp's own group-3 key carries a
		// Doc2: prefix (not Doc1:), since Doc1 is the CTMD metadata track and Doc2 is the
		// video track that owns Track4 -- confirm by measurement, never assume Doc1.
		residueAllowlist: [
			"Canon:ImageUniqueID",
			"Canon:TimeZone",
			"Canon:TimeZoneCity",
			"Canon:DaylightSavings",
			"Doc2:Track4:TimeStamp",
		],
		sourceIdentifyingKeys: [
			"IFD0:Artist",
			"ExifIFD:SubSecTimeOriginal",
			"Canon:InternalSerialNumber",
			"GPS:GPSLatitude",
		],
		imageDataHash:
			"9cafd813dcbb0e052ed7fbc884b2d2effb48e21da450d4557799cbe12a28ee9a",
	},
	{
		fixture: "Panasonic.rw2",
		decoderKeys: [
			"IFD0:Make",
			"IFD0:Model",
			"IFD0:PanasonicRawVersion",
			"IFD0:SensorWidth",
			"IFD0:SensorHeight",
			"IFD0:CFAPattern",
			"IFD0:BitsPerSample",
			"IFD0:Compression",
			"IFD0:WBRedLevel",
			"IFD0:WBBlueLevel",
		],
		residueAllowlist: [],
		sourceIdentifyingKeys: [
			"Doc1:IFD0:Artist",
			"ExifIFD:UserComment",
			"ExifIFD:SerialNumber",
			"GPS:GPSLatitude",
		],
		imageDataHash:
			"9627274f585b59c68181d64b4e23d95e38d59eb68c3054cffc08755e7a79dac1",
	},
] as const;
