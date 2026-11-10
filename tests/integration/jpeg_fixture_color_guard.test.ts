// Phase 69-02 (OVR-01; D-22c, T-69-04): the committed JPEG fixture set must cover colour. Before
// 69-02 every JPEG fixture was 1-component grayscale, so no test ever saw the File-group
// YCbCrSubSampling tag that ExifTool reports on every 3-component JPEG after metadata removal.
// The guard parses the SOF marker of each committed JPEG (no ExifTool involved) and fails when the
// set holds no 3-component 4:2:0 file or no 3-component 4:4:4 file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "../e2e/fixtures");

// Files that are deliberately not valid JPEGs; each is asserted invalid below so a rename or a
// regenerated valid file cannot hide behind this list.
const INVALID_JPEG_FIXTURES = ["corrupted.jpg", "zero_byte.jpg"] as const;

interface JpegFrame {
	readonly components: number;
	// Horizontal and vertical sampling factors of the first (luma) component.
	readonly lumaSampling: string;
}

interface ColorFixture {
	readonly name: string;
	readonly frame: JpegFrame;
}

// SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC).
function isStartOfFrame(marker: number): boolean {
	return (
		marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
	);
}

// Returns undefined when the buffer is not a JPEG with a readable frame header.
function readJpegFrame(buffer: Buffer): JpegFrame | undefined {
	if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
		return undefined;
	}
	let offset = 2;
	while (offset + 4 <= buffer.length) {
		if (buffer[offset] !== 0xff) return undefined;
		const marker = buffer[offset + 1];
		if (marker === undefined) return undefined;
		if (marker === 0xff) {
			offset += 1;
			continue;
		}
		if (marker === 0xd9 || marker === 0xda) return undefined;
		const length = buffer.readUInt16BE(offset + 2);
		if (isStartOfFrame(marker)) {
			// SOF payload: precision(1) height(2) width(2) components(1) then 3 bytes per component.
			const components = buffer[offset + 9];
			const sampling = buffer[offset + 11];
			if (components === undefined || sampling === undefined) return undefined;
			return {
				components,
				lumaSampling: `${sampling >> 4}x${sampling & 0x0f}`,
			};
		}
		offset += 2 + length;
	}
	return undefined;
}

function scanCommittedJpegs(): readonly ColorFixture[] {
	const fixtures: ColorFixture[] = [];
	for (const name of fs.readdirSync(FIXTURES).sort()) {
		if (!/\.jpe?g$/i.test(name)) continue;
		if ((INVALID_JPEG_FIXTURES as readonly string[]).includes(name)) continue;
		const frame = readJpegFrame(fs.readFileSync(path.join(FIXTURES, name)));
		if (frame === undefined) {
			throw new Error(`${name} is not a readable JPEG and is not allow-listed`);
		}
		fixtures.push({ name, frame });
	}
	return fixtures;
}

// Throws unless the set holds a 3-component 4:2:0 (luma 2x2) file and a 3-component 4:4:4 (luma
// 1x1) file.
function assertColorCoverage(fixtures: readonly ColorFixture[]): void {
	const colour = fixtures.filter((fixture) => fixture.frame.components === 3);
	const missing: string[] = [];
	if (!colour.some((fixture) => fixture.frame.lumaSampling === "2x2")) {
		missing.push("4:2:0 (luma sampling 2x2)");
	}
	if (!colour.some((fixture) => fixture.frame.lumaSampling === "1x1")) {
		missing.push("4:4:4 (luma sampling 1x1)");
	}
	if (missing.length > 0) {
		throw new Error(
			`no 3-component JPEG fixture with chroma subsampling ${missing.join(" and ")}`,
		);
	}
}

// The five JPEG fixtures committed before 69-02, all 1-component grayscale at 1x1.
const PRE_CHANGE_GRAYSCALE_SET: readonly ColorFixture[] = [
	"sample.jpg",
	"orientation.jpg",
	"no_metadata.jpg",
	"issue344_cooccurrence.jpg",
	"issue344_microsoft_photo.jpg",
].map((name) => ({
	name,
	frame: { components: 1, lumaSampling: "1x1" },
}));

describe("69-02: committed JPEG fixtures cover colour", () => {
	it("the committed set holds both a 4:2:0 and a 4:4:4 colour JPEG", () => {
		const fixtures = scanCommittedJpegs();
		expect(() => assertColorCoverage(fixtures)).not.toThrow();
		expect(
			fixtures
				.filter((fixture) => fixture.frame.components === 3)
				.map((fixture) => [fixture.name, fixture.frame.lumaSampling]),
		).toEqual([
			["color_420_progressive.jpg", "2x2"],
			["color_444.jpg", "1x1"],
			// 69-03: the 4:2:0 file with an embedded ICC profile (COLOR-PROVENANCE.md).
			["color_icc_p3.jpg", "2x2"],
		]);
	});

	it("the pre-change grayscale-only list is rejected, naming both missing subsamplings", () => {
		expect(() => assertColorCoverage(PRE_CHANGE_GRAYSCALE_SET)).toThrow(
			"no 3-component JPEG fixture with chroma subsampling 4:2:0 (luma sampling 2x2) and 4:4:4 (luma sampling 1x1)",
		);
	});

	it("a set with only 4:4:4 colour is rejected, naming 4:2:0", () => {
		const only444: readonly ColorFixture[] = [
			{ name: "x.jpg", frame: { components: 3, lumaSampling: "1x1" } },
		];
		expect(() => assertColorCoverage(only444)).toThrow(
			"no 3-component JPEG fixture with chroma subsampling 4:2:0 (luma sampling 2x2)",
		);
	});

	it("the allow-listed invalid JPEG fixtures really are invalid", () => {
		for (const name of INVALID_JPEG_FIXTURES) {
			expect(
				readJpegFrame(fs.readFileSync(path.join(FIXTURES, name))),
				name,
			).toBeUndefined();
		}
	});

	it("the five pre-change fixtures parse as 1-component grayscale on disk", () => {
		const byName = new Map(
			scanCommittedJpegs().map((fixture) => [fixture.name, fixture.frame]),
		);
		for (const { name } of PRE_CHANGE_GRAYSCALE_SET) {
			expect(byName.get(name)?.components, name).toBe(1);
		}
	});
});
