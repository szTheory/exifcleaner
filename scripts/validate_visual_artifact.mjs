#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";

const EXPECTED_IMAGE =
	"mcr.microsoft.com/playwright:v1.64.1-noble@sha256:2f05f8a734509a7b3f26a912639488ee08f58a7b292d14d62271bcff9038768f";
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
	let crc = value;
	for (let bit = 0; bit < 8; bit += 1) {
		crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
	}
	return crc >>> 0;
});

function argumentsFrom(argv) {
	const options = new Map();
	for (let index = 0; index < argv.length; index += 1) {
		const key = argv[index];
		const value = argv[index + 1];
		if (!key?.startsWith("--") || !value || value.startsWith("--")) {
			throw new Error(`expected an option/value pair near ${key ?? "end"}`);
		}
		if (options.has(key)) throw new Error(`duplicate option ${key}`);
		options.set(key, value);
		index += 1;
	}
	for (const required of ["--manifest", "--cases", "--root"]) {
		if (!options.has(required)) throw new Error(`missing ${required}`);
	}
	return options;
}

function readJson(file) {
	return JSON.parse(fs.readFileSync(file, "utf8"));
}

function fail(message) {
	throw new Error(message);
}

function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectedIdentity(row) {
	return {
		story: row.story,
		theme: row.theme,
		locale: row.locale,
		width: row.width,
		height: row.height,
		file: row.file,
	};
}

function filename(value) {
	return (
		typeof value === "string" &&
		value === path.basename(value) &&
		/^[A-Za-z0-9._-]+\.png$/u.test(value) &&
		!value.includes("..")
	);
}

function crc32(bytes) {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function pngDimensions(bytes, file, expected) {
	if (
		bytes.length < 24 ||
		bytes.length > 20 * 1024 * 1024 ||
		!bytes.subarray(0, 8).equals(PNG_SIGNATURE) ||
		bytes.toString("ascii", 12, 16) !== "IHDR"
	) {
		fail(`${file}: invalid PNG signature or IHDR`);
	}
	const width = bytes.readUInt32BE(16);
	const height = bytes.readUInt32BE(20);
	if (width !== expected.width || height !== expected.height) {
		fail(
			`${file}: PNG is ${width}x${height}, expected ${expected.width}x${expected.height}`,
		);
	}

	let offset = 8;
	let sawHeader = false;
	let sawPalette = false;
	let sawIdat = false;
	let idatEnded = false;
	let sawEnd = false;
	let bitDepth;
	let colorType;
	const imageData = [];
	while (offset < bytes.length) {
		if (offset + 12 > bytes.length) fail(`${file}: truncated PNG chunk`);
		const length = bytes.readUInt32BE(offset);
		const end = offset + 12 + length;
		if (!Number.isSafeInteger(end) || end > bytes.length) {
			fail(`${file}: PNG chunk exceeds file bounds`);
		}
		const typeBytes = bytes.subarray(offset + 4, offset + 8);
		const type = typeBytes.toString("ascii");
		const data = bytes.subarray(offset + 8, offset + 8 + length);
		const actualCrc = bytes.readUInt32BE(offset + 8 + length);
		if (crc32(Buffer.concat([typeBytes, data])) !== actualCrc) {
			fail(`${file}: CRC mismatch in ${type} chunk`);
		}
		if (!sawHeader && type !== "IHDR") fail(`${file}: IHDR is not first`);
		if (sawEnd) fail(`${file}: data follows the IEND chunk`);

		if (type === "IHDR") {
			if (sawHeader || length !== 13)
				fail(`${file}: invalid or duplicate IHDR`);
			sawHeader = true;
			bitDepth = data[8];
			colorType = data[9];
			if (data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
				fail(`${file}: unsupported compression, filter, or interlace mode`);
			}
		} else if (type === "PLTE") {
			if (sawIdat || length === 0 || length % 3 !== 0 || length > 768) {
				fail(`${file}: invalid PLTE chunk`);
			}
			sawPalette = true;
		} else if (type === "IDAT") {
			if (idatEnded) fail(`${file}: IDAT chunks are not consecutive`);
			sawIdat = true;
			imageData.push(data);
		} else if (type === "IEND") {
			if (length !== 0 || !sawIdat) fail(`${file}: invalid IEND chunk`);
			sawEnd = true;
			if (end !== bytes.length) fail(`${file}: data follows the IEND chunk`);
		} else {
			if (sawIdat) idatEnded = true;
			if ((typeBytes[0] & 0x20) === 0) {
				fail(`${file}: unsupported critical PNG chunk ${type}`);
			}
		}
		offset = end;
	}
	if (!sawHeader || !sawIdat || !sawEnd) fail(`${file}: incomplete PNG chunks`);
	if (colorType === 3 && !sawPalette) fail(`${file}: indexed PNG has no PLTE`);

	const channelsByType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
	const channels = channelsByType[colorType];
	const allowedDepths = {
		0: [1, 2, 4, 8, 16],
		2: [8, 16],
		3: [1, 2, 4, 8],
		4: [8, 16],
		6: [8, 16],
	};
	if (channels === undefined || !allowedDepths[colorType]?.includes(bitDepth)) {
		fail(`${file}: unsupported PNG color type or bit depth`);
	}
	const stride = Math.ceil((width * channels * bitDepth) / 8) + 1;
	const expectedInflatedBytes = stride * height;
	const inflated = inflateSync(Buffer.concat(imageData), {
		maxOutputLength: expectedInflatedBytes,
	});
	if (inflated.length !== expectedInflatedBytes) {
		fail(`${file}: decompressed PNG pixel data has the wrong size`);
	}
	for (let row = 0; row < height; row += 1) {
		if ((inflated[row * stride] ?? 255) > 4) {
			fail(`${file}: unsupported PNG row filter at row ${row}`);
		}
	}
	return { width, height };
}

function validate({ manifest, contract, root }) {
	if (!isRecord(contract) || contract.schemaVersion !== 1) {
		fail("case contract schemaVersion must be 1");
	}
	if (
		!Number.isInteger(contract.maxImages) ||
		contract.maxImages < 1 ||
		contract.maxImages > 40
	) {
		fail("case contract maxImages must be an integer from 1 to 40");
	}
	if (!Array.isArray(contract.cases) || contract.cases.length !== 25) {
		fail("case contract must declare exactly 25 images");
	}
	if (!isRecord(manifest) || manifest.schemaVersion !== 1) {
		fail("manifest schemaVersion must be 1");
	}
	if (manifest.image !== EXPECTED_IMAGE)
		fail("manifest uses the wrong capture image");
	if (manifest.ref !== "refs/heads/master") {
		fail(`manifest ref must be refs/heads/master, got ${String(manifest.ref)}`);
	}
	if (
		typeof manifest.commit !== "string" ||
		!/^[0-9a-f]{40}$/u.test(manifest.commit)
	) {
		fail("manifest commit must be a full Git SHA");
	}
	if (
		!isRecord(manifest.viewport) ||
		manifest.viewport.width !== 1280 ||
		manifest.viewport.height !== 800 ||
		manifest.viewport.captureScale !== 0.9 ||
		!Number.isFinite(manifest.deviceScaleFactor) ||
		manifest.deviceScaleFactor <= 0 ||
		manifest.deviceScaleFactor > 4
	) {
		fail(
			"manifest viewport must record 1280x800 CSS pixels and the measured 0.9 capture scale",
		);
	}
	if (
		!Array.isArray(manifest.cases) ||
		manifest.cases.length !== contract.cases.length
	) {
		fail("manifest must contain exactly the declared 25 cases");
	}
	if (manifest.cases.length > contract.maxImages) {
		fail("manifest image count exceeds the case contract cap");
	}
	if (
		!/^\d+$/u.test(String(manifest.runId)) ||
		!/^\d+$/u.test(String(manifest.runAttempt))
	) {
		fail("manifest must record the workflow run id and attempt");
	}

	const expectedNames = new Set();
	const expectedCases = new Set();
	for (const [index, expected] of contract.cases.entries()) {
		if (!isRecord(expected) || !filename(expected.file)) {
			fail(`case contract row ${index + 1} has an unsafe filename`);
		}
		const identity = expectedIdentity(expected);
		const caseKey = `${identity.story}|${identity.theme}|${identity.locale}|${identity.width}`;
		if (expectedCases.has(caseKey)) fail(`duplicate case identity ${caseKey}`);
		if (expectedNames.has(identity.file))
			fail(`duplicate case filename ${identity.file}`);
		expectedCases.add(caseKey);
		expectedNames.add(identity.file);

		const actual = manifest.cases[index];
		if (!isRecord(actual)) fail(`manifest row ${index + 1} is not an object`);
		for (const [key, value] of Object.entries(identity)) {
			if (actual[key] !== value) {
				fail(`manifest row ${index + 1} ${key} differs from the case contract`);
			}
		}
		if (actual.stable !== true)
			fail(`${identity.file}: capture was not stable`);
		if (
			!Number.isInteger(actual.attempts) ||
			actual.attempts < 2 ||
			actual.attempts > 9
		) {
			fail(`${identity.file}: invalid stable-frame attempt count`);
		}
		if (!Number.isInteger(actual.bytes) || actual.bytes < 24) {
			fail(`${identity.file}: invalid PNG byte count`);
		}
		const imagePath = path.join(root, identity.file);
		const stat = fs.lstatSync(imagePath);
		if (!stat.isFile() || stat.isSymbolicLink()) {
			fail(`${identity.file}: artifact image must be a regular file`);
		}
		const bytes = fs.readFileSync(imagePath);
		const pixelWidth = Math.round(
			identity.width * manifest.viewport.captureScale,
		);
		const pixelHeight = Math.round(
			identity.height * manifest.viewport.captureScale,
		);
		const size = pngDimensions(bytes, identity.file, {
			width: pixelWidth,
			height: pixelHeight,
		});
		if (
			actual.pixelWidth !== pixelWidth ||
			actual.pixelHeight !== pixelHeight ||
			size.width !== actual.pixelWidth ||
			size.height !== actual.pixelHeight
		) {
			fail(`${identity.file}: manifest pixel dimensions do not match the PNG`);
		}
		if (actual.bytes !== bytes.length)
			fail(`${identity.file}: byte count mismatch`);
		const sha256 = createHash("sha256").update(bytes).digest("hex");
		if (actual.sha256 !== sha256) fail(`${identity.file}: SHA-256 mismatch`);
	}

	const pngFiles = fs
		.readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.name.toLowerCase().endsWith(".png"))
		.map((entry) => entry.name);
	const permittedPngs = new Set([...expectedNames, "contact-sheet.png"]);
	const unexpected = pngFiles.filter((file) => !permittedPngs.has(file));
	const absent = [...expectedNames].filter((file) => !pngFiles.includes(file));
	if (unexpected.length)
		fail(`unexpected PNG files: ${unexpected.sort().join(", ")}`);
	if (absent.length) fail(`missing PNG files: ${absent.sort().join(", ")}`);
	if (
		pngFiles.length !== expectedNames.size &&
		pngFiles.length !== expectedNames.size + 1
	) {
		fail(
			"artifact must contain 25 case PNGs and at most one contact-sheet.png",
		);
	}

	return {
		commit: manifest.commit,
		ref: manifest.ref,
		runId: manifest.runId,
		cases: manifest.cases.length,
		verifiedPngs: expectedNames.size,
	};
}

try {
	const options = argumentsFrom(process.argv.slice(2));
	const manifestPath = path.resolve(options.get("--manifest"));
	const casesPath = path.resolve(options.get("--cases"));
	const root = fs.realpathSync(path.resolve(options.get("--root")));
	const result = validate({
		manifest: readJson(manifestPath),
		contract: readJson(casesPath),
		root,
	});
	console.log(JSON.stringify(result, null, "\t"));
} catch (error) {
	console.error(`visual artifact validation failed: ${error.message}`);
	process.exitCode = 1;
}

export { validate };
