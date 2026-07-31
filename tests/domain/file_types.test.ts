import { it, expect } from "vitest";
import {
	isRawFile,
	isSupportedFile,
	isVideoFile,
	RAW_EXTENSIONS,
	VIDEO_EXTENSIONS,
} from "../../src/domain/files/file_types";

it("returns true for supported image extensions", () => {
	expect(isSupportedFile({ filename: "photo.jpg" })).toBe(true);
	expect(isSupportedFile({ filename: "image.png" })).toBe(true);
	expect(isSupportedFile({ filename: "pic.webp" })).toBe(true);
	expect(isSupportedFile({ filename: "shot.heic" })).toBe(true);
});

it("returns true for supported video extensions", () => {
	expect(isSupportedFile({ filename: "video.mp4" })).toBe(true);
	expect(isSupportedFile({ filename: "clip.mov" })).toBe(true);
});

it("returns true for PDF", () => {
	expect(isSupportedFile({ filename: "document.pdf" })).toBe(true);
});

it("returns false for unsupported extensions", () => {
	expect(isSupportedFile({ filename: "readme.txt" })).toBe(false);
	expect(isSupportedFile({ filename: "report.doc" })).toBe(false);
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

it("classifies exactly the seven supported video extensions case-insensitively", () => {
	expect([...VIDEO_EXTENSIONS]).toEqual([
		".mp4",
		".mov",
		".avi",
		".mkv",
		".m4v",
		".3gp",
		".wmv",
	]);
	expect(isVideoFile({ filename: "sample.mp4" })).toBe(true);
	expect(isVideoFile({ filename: "sample.MOV" })).toBe(true);
	expect(isVideoFile({ filename: "sample.jpg" })).toBe(false);
});
