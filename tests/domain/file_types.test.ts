import { it, expect } from "vitest";
import {
	isRawFile,
	isSupportedFile,
	isMediaFile,
	isTiffFile,
	requiresVerifiedWrite,
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

it("requiresVerifiedWrite routes raw, media, TIFF (both modes), and copy-mode webp through the verified transaction, but not overwrite-mode webp or an ordinary jpeg copy (D-23, D-24)", () => {
	expect(
		requiresVerifiedWrite({ filename: "sample.cr2", outputMode: "copy" }),
	).toBe(true);
	expect(
		requiresVerifiedWrite({ filename: "sample.cr2", outputMode: "overwrite" }),
	).toBe(true);
	expect(
		requiresVerifiedWrite({ filename: "sample.mp4", outputMode: "copy" }),
	).toBe(true);
	expect(
		requiresVerifiedWrite({ filename: "sample.mp4", outputMode: "overwrite" }),
	).toBe(true);
	expect(
		requiresVerifiedWrite({ filename: "sample.tif", outputMode: "copy" }),
	).toBe(true);
	expect(
		requiresVerifiedWrite({ filename: "sample.tif", outputMode: "overwrite" }),
	).toBe(true);
	expect(
		requiresVerifiedWrite({ filename: "sample.tiff", outputMode: "copy" }),
	).toBe(true);
	expect(
		requiresVerifiedWrite({ filename: "sample.tiff", outputMode: "overwrite" }),
	).toBe(true);
	expect(
		requiresVerifiedWrite({ filename: "sample.webp", outputMode: "copy" }),
	).toBe(true);
	// This phase intentionally leaves in-place webp overwrites on the unverified
	// ExifTool path (D-19/D-24/D-42); out of scope for this plan.
	expect(
		requiresVerifiedWrite({ filename: "sample.webp", outputMode: "overwrite" }),
	).toBe(false);
	expect(
		requiresVerifiedWrite({ filename: "sample.jpg", outputMode: "copy" }),
	).toBe(false);
	expect(
		requiresVerifiedWrite({ filename: "sample.jpg", outputMode: "overwrite" }),
	).toBe(false);
});
