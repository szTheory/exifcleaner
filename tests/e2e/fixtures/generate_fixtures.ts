/**
 * Fixture generation script for E2E tests.
 * Creates minimal test files with known metadata using the bundled ExifTool.
 *
 * Run with: npx tsx tests/e2e/fixtures/generate_fixtures.ts
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXIFTOOL =
	process.platform === "win32"
		? path.resolve(__dirname, "../../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../../.resources/nix/bin/exiftool");

const FIXTURES_DIR = __dirname;

// Minimal valid 1x1 white JPEG (JFIF)
function createMinimalJpeg(): Buffer {
	return Buffer.from([
		// SOI
		0xff, 0xd8,
		// APP0 JFIF marker
		0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
		0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
		// DQT (quantization table)
		0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
		0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b,
		0x0b, 0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d,
		0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c,
		0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
		0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32,
		// SOF0 (Start of Frame, baseline, 1x1, 1 component)
		0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11,
		0x00,
		// DHT (Huffman table - DC)
		0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01,
		0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02,
		0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b,
		// DHT (Huffman table - AC)
		0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03, 0x03, 0x02, 0x04,
		0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d, 0x01, 0x02, 0x03,
		0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61,
		0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1,
		0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a,
		0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34,
		0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
		0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64,
		0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78,
		0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93,
		0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6,
		0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9,
		0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3,
		0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5,
		0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7,
		0xf8, 0xf9, 0xfa,
		// SOS (Start of Scan)
		0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7b, 0x40,
		// Scan data (minimal 1x1 pixel)
		0x1b,
		// EOI
		0xff, 0xd9,
	]);
}

// Build a PNG chunk with correct CRC32 (covers type + data)
function pngChunk(type: string, data: Buffer): Buffer {
	const typeBytes = Buffer.from(type, "ascii");
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length, 0);
	const crcInput = Buffer.concat([typeBytes, data]);
	const crc = Buffer.alloc(4);
	crc.writeInt32BE(crc32(crcInput), 0);
	return Buffer.concat([length, typeBytes, data, crc]);
}

// CRC32 for PNG (ISO 3309 / ITU-T V.42)
function crc32(buf: Buffer): number {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) {
		c = c ^ buf[i]!;
		for (let j = 0; j < 8; j++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
	}
	return (c ^ 0xffffffff) | 0;
}

// Minimal valid 1x1 PNG (white pixel) with correct CRCs
function createMinimalPng(): Buffer {
	const signature = Buffer.from([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	]);
	// IHDR: width=1, height=1, bit_depth=8, color_type=2 (RGB), compression=0, filter=0, interlace=0
	const ihdrData = Buffer.from([
		0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00,
		0x00,
	]);
	// Raw pixel data: filter byte 0 + RGB white (255, 255, 255)
	const rawPixel = Buffer.from([0x00, 0xff, 0xff, 0xff]);
	const compressed = zlib.deflateSync(rawPixel);
	return Buffer.concat([
		signature,
		pngChunk("IHDR", ihdrData),
		pngChunk("IDAT", compressed),
		pngChunk("IEND", Buffer.alloc(0)),
	]);
}

// Minimal valid PDF with correct xref offsets
// PDF spec: xref entries must be exactly 20 bytes each with \r\n or space+\n terminator
function createMinimalPdf(): Buffer {
	// Build body objects, tracking byte offsets precisely
	const parts: string[] = [];
	const offsets: number[] = [];
	let pos = 0;

	const addPart = (s: string): void => {
		parts.push(s);
		pos += Buffer.byteLength(s, "ascii");
	};
	const markOffset = (): void => {
		offsets.push(pos);
	};

	addPart("%PDF-1.4\n");

	markOffset(); // obj 1
	addPart("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

	markOffset(); // obj 2
	addPart("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

	markOffset(); // obj 3
	addPart(
		"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n",
	);

	const xrefOffset = pos;
	const pad = (n: number): string => String(n).padStart(10, "0");

	// Each xref entry must be exactly 20 bytes: oooooooooo ggggg f/n \r\n (no trailing space before \r\n)
	// Format: 10-digit offset + space + 5-digit generation + space + 'f'/'n' + space + \n = 20 bytes
	// OR: 10-digit offset + space + 5-digit generation + space + 'f'/'n' + \r + \n = 20 bytes
	addPart("xref\n");
	addPart("0 4\n");
	addPart(`${pad(0)} 65535 f\r\n`);
	addPart(`${pad(offsets[0]!)} 00000 n\r\n`);
	addPart(`${pad(offsets[1]!)} 00000 n\r\n`);
	addPart(`${pad(offsets[2]!)} 00000 n\r\n`);
	addPart("trailer\n<< /Size 4 /Root 1 0 R >>\n");
	addPart(`startxref\n${xrefOffset}\n%%EOF\n`);

	return Buffer.from(parts.join(""), "ascii");
}

// Minimal valid MP4 container (ftyp + moov atoms)
function createMinimalMp4(): Buffer {
	const ftyp = Buffer.from([
		// ftyp box: size=20, 'ftyp', brand='isom', version=0x200, compat='isom'
		0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
		0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d,
	]);
	const moov = Buffer.from([
		// moov box: size=8, 'moov'
		0x00, 0x00, 0x00, 0x08, 0x6d, 0x6f, 0x6f, 0x76,
	]);
	return Buffer.concat([ftyp, moov]);
}

// Minimal valid WebP (VP8 lossy) — a proper 1x1 keyframe
// VP8 spec: frame tag (3 bytes) + start code (3 bytes) + frame header
function createMinimalWebp(): Buffer {
	// Known-good minimal 1x1 VP8 bitstream (10 bytes)
	// Frame tag: keyframe, version=0, show_frame=1, first_part_size
	// Start code: 0x9D 0x01 0x2A
	// Width=1 (no scale), Height=1 (no scale)
	// Then minimal partition data
	const vp8Data = Buffer.from([
		// Frame tag: keyframe=0, version=0, show_frame=1, partition0_size=3
		0x30, 0x01, 0x00,
		// Start code + dimensions
		0x9d, 0x01, 0x2a, // VP8 start code
		0x01, 0x00, // width=1, scale=0
		0x01, 0x00, // height=1, scale=0
		// Minimal partition data (boolean decoder init + single macroblock)
		0x02, 0x00, 0x34, 0x25, 0xa4, 0x00, 0x03, 0x70, 0x00, 0xfe, 0xfb, 0x94,
		0x00, 0x00,
	]);

	// VP8 chunk size must match actual data (pad to even if needed)
	const paddedVp8 =
		vp8Data.length % 2 === 0
			? vp8Data
			: Buffer.concat([vp8Data, Buffer.alloc(1)]);

	const vp8Header = Buffer.alloc(8);
	vp8Header.write("VP8 ", 0);
	vp8Header.writeUInt32LE(vp8Data.length, 4); // chunk size is unpadded

	const riffPayloadSize = 4 + 8 + paddedVp8.length; // 'WEBP' + chunk header + padded data
	const riffHeader = Buffer.alloc(12);
	riffHeader.write("RIFF", 0);
	riffHeader.writeUInt32LE(riffPayloadSize, 4);
	riffHeader.write("WEBP", 8);

	return Buffer.concat([riffHeader, vp8Header, paddedVp8]);
}

function generateFixtures(): void {
	console.log("Generating E2E test fixtures...");

	// sample.jpg - JPEG with known EXIF tags
	const jpegPath = path.join(FIXTURES_DIR, "sample.jpg");
	fs.writeFileSync(jpegPath, createMinimalJpeg());
	execFileSync(EXIFTOOL, [
		"-overwrite_original",
		"-Artist=Test Author",
		"-Copyright=Test Copyright 2024",
		"-GPSLatitude=37.7749",
		"-GPSLongitude=-122.4194",
		"-Make=TestCamera",
		"-Model=TestModel",
		"-DateTimeOriginal=2024:01:01 12:00:00",
		jpegPath,
	]);
	console.log("  Created sample.jpg (JPEG with EXIF)");

	// sample.png - PNG with known metadata (tEXt chunks)
	const pngPath = path.join(FIXTURES_DIR, "sample.png");
	fs.writeFileSync(pngPath, createMinimalPng());
	execFileSync(EXIFTOOL, [
		"-overwrite_original",
		"-Author=Test Author",
		"-Copyright=Test Copyright 2024",
		pngPath,
	]);
	console.log("  Created sample.png (PNG with metadata)");

	// sample.pdf - PDF with metadata
	const pdfPath = path.join(FIXTURES_DIR, "sample.pdf");
	fs.writeFileSync(pdfPath, createMinimalPdf());
	try {
		execFileSync(EXIFTOOL, [
			"-overwrite_original",
			"-Author=Test Author",
			"-Title=Test Document",
			"-Creator=TestCreator",
			pdfPath,
		]);
	} catch {
		// ExifTool may warn about minimal PDF structure; file is still valid
		console.log("  Note: PDF metadata injection had warnings (expected)");
	}
	console.log("  Created sample.pdf (PDF with metadata)");

	// sample.mp4 - MP4 with metadata
	const mp4Path = path.join(FIXTURES_DIR, "sample.mp4");
	fs.writeFileSync(mp4Path, createMinimalMp4());
	try {
		execFileSync(EXIFTOOL, [
			"-overwrite_original",
			"-Artist=Test Author",
			"-Title=Test Video",
			mp4Path,
		]);
	} catch {
		// ExifTool may warn about minimal MP4 structure; the file is still valid
		console.log("  Note: MP4 metadata injection had warnings (expected)");
	}
	console.log("  Created sample.mp4 (MP4 container)");

	// sample.webp - WebP with metadata
	const webpPath = path.join(FIXTURES_DIR, "sample.webp");
	fs.writeFileSync(webpPath, createMinimalWebp());
	try {
		execFileSync(EXIFTOOL, [
			"-overwrite_original",
			"-Artist=Test Author",
			"-Make=TestCamera",
			webpPath,
		]);
	} catch {
		// ExifTool may warn about minimal WebP structure
		console.log("  Note: WebP metadata injection had warnings (expected)");
	}
	console.log("  Created sample.webp (WebP with EXIF)");

	// Error fixtures
	// corrupted.jpg - JPEG magic bytes followed by garbage
	const corruptedPath = path.join(FIXTURES_DIR, "corrupted.jpg");
	const corruptedData = Buffer.alloc(50);
	corruptedData[0] = 0xff;
	corruptedData[1] = 0xd8;
	corruptedData[2] = 0xff;
	for (let i = 3; i < 50; i++) {
		corruptedData[i] = Math.floor(Math.random() * 256);
	}
	fs.writeFileSync(corruptedPath, corruptedData);
	console.log("  Created corrupted.jpg (garbled content)");

	// unsupported.txt - plain text file
	const txtPath = path.join(FIXTURES_DIR, "unsupported.txt");
	fs.writeFileSync(txtPath, "This is not an image file.");
	console.log("  Created unsupported.txt (unsupported format)");

	// zero_byte.jpg - empty file
	const zeroPath = path.join(FIXTURES_DIR, "zero_byte.jpg");
	fs.writeFileSync(zeroPath, Buffer.alloc(0));
	console.log("  Created zero_byte.jpg (zero bytes)");

	// no_metadata.jpg - valid JPEG with no EXIF injected
	const noMetaPath = path.join(FIXTURES_DIR, "no_metadata.jpg");
	fs.writeFileSync(noMetaPath, createMinimalJpeg());
	console.log("  Created no_metadata.jpg (JPEG without EXIF)");

	console.log("\nAll 9 fixture files generated successfully.");
}

generateFixtures();
