import { it, expect } from "vitest";
import {
	isRawFile,
	isSupportedFile,
	isMediaFile,
	isTiffFile,
	requiresVerifiedWrite,
	copyModeLeakCheckDemandOf,
	requiresCopyModeLeakCheck,
	RAW_EXTENSIONS,
	MEDIA_EXTENSIONS,
	TIFF_EXTENSIONS,
} from "../../src/domain/files/file_types";

it("returns true for supported image extensions", () => {
	expect(isSupportedFile({ filename: "photo.jpg" })).toBe(true);
	expect(isSupportedFile({ filename: "image.png" })).toBe(true);
	expect(isSupportedFile({ filename: "pic.webp" })).toBe(true);
	expect(isSupportedFile({ filename: "shot.heic" })).toBe(true);
});

it("returns true for supported media extensions", () => {
	expect(isSupportedFile({ filename: "video.mp4" })).toBe(true);
	expect(isSupportedFile({ filename: "clip.mov" })).toBe(true);
	expect(isSupportedFile({ filename: "audio.m4a" })).toBe(true);
});

it("returns true for PDF", () => {
	expect(isSupportedFile({ filename: "document.pdf" })).toBe(true);
});

it("returns false for unsupported extensions", () => {
	expect(isSupportedFile({ filename: "readme.txt" })).toBe(false);
	expect(isSupportedFile({ filename: "report.doc" })).toBe(false);
	expect(isSupportedFile({ filename: "movie.mkv" })).toBe(false);
	expect(isSupportedFile({ filename: "report.docx" })).toBe(false);
	expect(isSupportedFile({ filename: "malware.exe" })).toBe(false);
});

it("returns false for files without extension", () => {
	expect(isSupportedFile({ filename: "noext" })).toBe(false);
});

it("is case insensitive", () => {
	expect(isSupportedFile({ filename: "PHOTO.JPG" })).toBe(true);
	expect(isSupportedFile({ filename: "Image.Png" })).toBe(true);
});

it("classifies exactly the supported RAW extensions case-insensitively", () => {
	expect([...RAW_EXTENSIONS]).toEqual([
		".raf",
		".cr2",
		".cr3",
		".nef",
		".arw",
		".orf",
		".rw2",
		".dng",
		".pef",
		".srw",
	]);
	expect(isRawFile({ filename: "sample.raf" })).toBe(true);
	expect(isRawFile({ filename: "sample.RAF" })).toBe(true);
	expect(isRawFile({ filename: "sample.jpg" })).toBe(false);
});

it("classifies exactly the seven supported media extensions case-insensitively", () => {
	expect([...MEDIA_EXTENSIONS]).toEqual([
		".mp4",
		".mov",
		".avi",
		".m4a",
		".m4v",
		".3gp",
		".wmv",
	]);
	expect(isMediaFile({ filename: "sample.mp4" })).toBe(true);
	expect(isMediaFile({ filename: "sample.M4A" })).toBe(true);
	expect(isMediaFile({ filename: "sample.mkv" })).toBe(false);
	expect(isMediaFile({ filename: "sample.jpg" })).toBe(false);
});

it("classifies exactly the two supported TIFF extensions, case-insensitively, with last-extension and empty/degenerate edges (D-23)", () => {
	expect([...TIFF_EXTENSIONS]).toEqual([".tif", ".tiff"]);
	expect(isTiffFile({ filename: "scan.tif" })).toBe(true);
	expect(isTiffFile({ filename: "scan.tiff" })).toBe(true);
	expect(isTiffFile({ filename: "PHOTO.TIF" })).toBe(true);
	expect(isTiffFile({ filename: "scan.TIFF" })).toBe(true);
	expect(isTiffFile({ filename: "photo.dng.tif" })).toBe(true);
	expect(isTiffFile({ filename: ".tif" })).toBe(true);
	expect(isTiffFile({ filename: "photo.tif.dng" })).toBe(false);
	expect(isTiffFile({ filename: "tif" })).toBe(false);
	expect(isTiffFile({ filename: "" })).toBe(false);
	expect(isTiffFile({ filename: "scan.btf" })).toBe(false);
	expect(isTiffFile({ filename: "sample.jpg" })).toBe(false);
	expect(isTiffFile({ filename: "sample.mp4" })).toBe(false);
});

it("isTiffFile is false for every RAW_EXTENSIONS member, .dng named explicitly (D-23)", () => {
	for (const ext of RAW_EXTENSIONS) {
		expect(isTiffFile({ filename: `sample${ext}` })).toBe(false);
	}
	expect(isTiffFile({ filename: "sample.dng" })).toBe(false);
});

it("TIFF_EXTENSIONS is disjoint from RAW_EXTENSIONS and from MEDIA_EXTENSIONS (D-23)", () => {
	const tiffRawIntersection = [...TIFF_EXTENSIONS].filter((ext) =>
		RAW_EXTENSIONS.has(ext),
	);
	const tiffMediaIntersection = [...TIFF_EXTENSIONS].filter((ext) =>
		MEDIA_EXTENSIONS.has(ext),
	);
	expect(tiffRawIntersection).toEqual([]);
	expect(tiffMediaIntersection).toEqual([]);
});

it("requiresVerifiedWrite routes raw, media and TIFF in both modes and the seven native image extensions in both modes from 4.8.0 (OVR-01, D-08)", () => {
	for (const filename of [
		"sample.cr2",
		"sample.mp4",
		"sample.tif",
		"sample.tiff",
	]) {
		expect(requiresVerifiedWrite({ filename, outputMode: "copy" })).toBe(true);
		expect(requiresVerifiedWrite({ filename, outputMode: "overwrite" })).toBe(
			true,
		);
	}
	for (const filename of [
		"sample.jpg",
		"sample.jpeg",
		"sample.png",
		"sample.webp",
		"sample.heic",
		"sample.heif",
		"sample.avif",
		"PHOTO.JPG",
		"PHOTO.JPEG",
		"PHOTO.PNG",
		"PHOTO.WEBP",
		"PHOTO.HEIC",
		"PHOTO.HEIF",
		"PHOTO.AVIF",
	]) {
		expect(requiresVerifiedWrite({ filename, outputMode: "copy" })).toBe(true);
		expect(requiresVerifiedWrite({ filename, outputMode: "overwrite" })).toBe(
			true,
		);
	}
	// Unsupported or extension-less names are never routed through the transaction.
	for (const filename of ["sample.gif", "sample.bmp", "notes.txt", "noext"]) {
		expect(requiresVerifiedWrite({ filename, outputMode: "copy" })).toBe(false);
		expect(requiresVerifiedWrite({ filename, outputMode: "overwrite" })).toBe(
			false,
		);
	}
});

it("requiresCopyModeLeakCheck is true for the seven native image extensions in both modes (overwrite from 4.8.0, OVR-01), false for tiff/raw/media in either mode (D-11)", () => {
	for (const filename of [
		"sample.png",
		"sample.jpg",
		"sample.jpeg",
		"PHOTO.JPG",
		"sample.webp",
		"PHOTO.WEBP",
		"sample.heic",
		"sample.heif",
		"sample.avif",
	]) {
		expect(requiresCopyModeLeakCheck({ filename, outputMode: "copy" })).toBe(
			true,
		);
		expect(
			requiresCopyModeLeakCheck({ filename, outputMode: "overwrite" }),
		).toBe(true);
	}
	for (const filename of ["sample.tif", "sample.cr2", "sample.mp4"]) {
		expect(requiresCopyModeLeakCheck({ filename, outputMode: "copy" })).toBe(
			false,
		);
		expect(
			requiresCopyModeLeakCheck({ filename, outputMode: "overwrite" }),
		).toBe(false);
	}
});

it("isMediaFile is false for png, jpg and jpeg; MEDIA_EXTENSIONS keeps its existing literal assertion (D-11)", () => {
	expect(isMediaFile({ filename: "sample.png" })).toBe(false);
	expect(isMediaFile({ filename: "sample.jpg" })).toBe(false);
	expect(isMediaFile({ filename: "sample.jpeg" })).toBe(false);
});

it.each([["sample.heic"], ["SAMPLE.HEIC"], ["sample.heif"], ["sample.avif"]])(
	"%s is verified and leak-checked in both modes from 4.8.0 (overwrite: OVR-01, D-08) and is not a media file",
	(filename) => {
		expect(requiresVerifiedWrite({ filename, outputMode: "copy" })).toBe(true);
		expect(requiresCopyModeLeakCheck({ filename, outputMode: "copy" })).toBe(
			true,
		);
		expect(requiresVerifiedWrite({ filename, outputMode: "overwrite" })).toBe(
			true,
		);
		expect(
			requiresCopyModeLeakCheck({ filename, outputMode: "overwrite" }),
		).toBe(true);
		expect(isMediaFile({ filename })).toBe(false);
	},
);

it("webp copies and overwrites are verified and leak-checked from 4.8.0 against a measured allowlist (D-03, D-06, OVR-01)", () => {
	for (const outputMode of ["copy", "overwrite"] as const) {
		expect(requiresVerifiedWrite({ filename: "sample.webp", outputMode })).toBe(
			true,
		);
		expect(
			requiresCopyModeLeakCheck({ filename: "sample.webp", outputMode }),
		).toBe(true);
	}
	expect(isMediaFile({ filename: "sample.webp" })).toBe(false);
});

it("copyModeLeakCheckDemandOf is required for leak-checked copies, when-allowlisted for other verified copies, undefined otherwise (D-08)", () => {
	for (const filename of [
		"a.png",
		"a.jpg",
		"a.jpeg",
		"a.heic",
		"a.HEIC",
		"a.heif",
		"a.avif",
		"a.webp",
		"a.WEBP",
	]) {
		expect(copyModeLeakCheckDemandOf({ filename, outputMode: "copy" })).toBe(
			"required",
		);
	}
	for (const filename of ["a.dng", "a.tif", "a.mp4", "a.mov"]) {
		expect(copyModeLeakCheckDemandOf({ filename, outputMode: "copy" })).toBe(
			"when-allowlisted",
		);
	}
	// From 4.8.0 (OVR-01, D-08) overwrite of the seven native image extensions is leak-checked too.
	for (const filename of [
		"a.png",
		"a.jpg",
		"a.jpeg",
		"a.JPG",
		"a.heic",
		"a.heif",
		"a.avif",
		"a.webp",
		"a.WEBP",
	]) {
		expect(
			copyModeLeakCheckDemandOf({ filename, outputMode: "overwrite" }),
		).toBe("required");
	}
	// RAW, TIFF and media overwrite stay verify-only (no leak demand).
	for (const filename of ["a.dng", "a.tif", "a.tiff", "a.mp4", "a.mov"]) {
		expect(
			copyModeLeakCheckDemandOf({ filename, outputMode: "overwrite" }),
		).toBeUndefined();
	}
	for (const outputMode of ["copy", "overwrite"] as const) {
		expect(
			copyModeLeakCheckDemandOf({ filename: "a.gif", outputMode }),
		).toBeUndefined();
	}
	expect(
		copyModeLeakCheckDemandOf({ filename: "a.txt", outputMode: "copy" }),
	).toBeUndefined();
});
