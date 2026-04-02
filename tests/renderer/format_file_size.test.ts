import { describe, it, expect } from "vitest";
import { formatFileSize } from "../../src/renderer/utils/format_file_size";
import { getFileExtension } from "../../src/renderer/utils/get_file_extension";

describe("formatFileSize", () => {
	it("returns '0 B' for 0 bytes", () => {
		expect(formatFileSize({ bytes: 0 })).toBe("0 B");
	});

	it("returns '512 B' for 512 bytes", () => {
		expect(formatFileSize({ bytes: 512 })).toBe("512 B");
	});

	it("returns '1.0 KB' for 1024 bytes", () => {
		expect(formatFileSize({ bytes: 1024 })).toBe("1.0 KB");
	});

	it("returns '1.5 KB' for 1536 bytes", () => {
		expect(formatFileSize({ bytes: 1536 })).toBe("1.5 KB");
	});

	it("returns '1.0 MB' for 1048576 bytes", () => {
		expect(formatFileSize({ bytes: 1048576 })).toBe("1.0 MB");
	});

	it("returns '1.5 MB' for 1572864 bytes", () => {
		expect(formatFileSize({ bytes: 1572864 })).toBe("1.5 MB");
	});

	it("returns '1.0 GB' for 1073741824 bytes", () => {
		expect(formatFileSize({ bytes: 1073741824 })).toBe("1.0 GB");
	});

	it("returns '2.4 MB' for 2500000 bytes", () => {
		expect(formatFileSize({ bytes: 2500000 })).toBe("2.4 MB");
	});
});

describe("getFileExtension", () => {
	it("returns 'JPG' for 'photo.jpg'", () => {
		expect(getFileExtension({ filename: "photo.jpg" })).toBe("JPG");
	});

	it("returns 'PDF' for 'document.PDF'", () => {
		expect(getFileExtension({ filename: "document.PDF" })).toBe("PDF");
	});

	it("returns '' for 'no-extension'", () => {
		expect(getFileExtension({ filename: "no-extension" })).toBe("");
	});

	it("returns 'HEIC' for 'photo.HEIC'", () => {
		expect(getFileExtension({ filename: "photo.HEIC" })).toBe("HEIC");
	});

	it("returns 'GZ' for 'archive.tar.gz'", () => {
		expect(getFileExtension({ filename: "archive.tar.gz" })).toBe("GZ");
	});
});
