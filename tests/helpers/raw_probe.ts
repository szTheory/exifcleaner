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
] as const;
