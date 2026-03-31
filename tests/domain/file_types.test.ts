import { it, expect } from "vitest";
import { isSupportedFile } from "../../src/domain/files/file_types";

it("returns true for supported image extensions", () => {
	expect(isSupportedFile("photo.jpg")).toBe(true);
	expect(isSupportedFile("image.png")).toBe(true);
	expect(isSupportedFile("pic.webp")).toBe(true);
	expect(isSupportedFile("shot.heic")).toBe(true);
});

it("returns true for supported video extensions", () => {
	expect(isSupportedFile("video.mp4")).toBe(true);
	expect(isSupportedFile("clip.mov")).toBe(true);
});

it("returns true for PDF", () => {
	expect(isSupportedFile("document.pdf")).toBe(true);
});

it("returns false for unsupported extensions", () => {
	expect(isSupportedFile("readme.txt")).toBe(false);
	expect(isSupportedFile("report.doc")).toBe(false);
	expect(isSupportedFile("malware.exe")).toBe(false);
});

it("returns false for files without extension", () => {
	expect(isSupportedFile("noext")).toBe(false);
});

it("is case insensitive", () => {
	expect(isSupportedFile("PHOTO.JPG")).toBe(true);
	expect(isSupportedFile("Image.Png")).toBe(true);
});
