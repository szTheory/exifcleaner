// Builds a small, synthetic ICC v2 RGB display profile that carries the 'chad'
// (ChromaticAdaptation) and 'bkpt' (MediaBlackPoint) tags. Real camera and phone JPEGs embed
// sRGB profiles with both (for example a Pixel's "sRGB IEC61966-2.1"), but none of this
// repo's fixtures do. Built from the ICC.1 layout so no third-party profile bytes are vendored.

function s15Fixed16(value: number): Buffer {
	const buf = Buffer.alloc(4);
	buf.writeInt32BE(Math.round(value * 65536));
	return buf;
}

function xyzType(x: number, y: number, z: number): Buffer {
	return Buffer.concat([
		Buffer.from("XYZ \0\0\0\0", "latin1"),
		s15Fixed16(x),
		s15Fixed16(y),
		s15Fixed16(z),
	]);
}

function sf32Type(values: readonly number[]): Buffer {
	return Buffer.concat([
		Buffer.from("sf32\0\0\0\0", "latin1"),
		...values.map(s15Fixed16),
	]);
}

function gammaCurveType(gamma: number): Buffer {
	const buf = Buffer.alloc(14);
	buf.write("curv", 0, "latin1");
	buf.writeUInt32BE(1, 8);
	buf.writeUInt16BE(Math.round(gamma * 256), 12);
	return buf;
}

function textType(text: string): Buffer {
	return Buffer.concat([
		Buffer.from("text\0\0\0\0", "latin1"),
		Buffer.from(`${text}\0`, "latin1"),
	]);
}

function descType(text: string): Buffer {
	const ascii = Buffer.from(`${text}\0`, "latin1");
	const count = Buffer.alloc(4);
	count.writeUInt32BE(ascii.length);
	// Empty Unicode (language code + count) and empty ScriptCode (code + count + 67 bytes).
	return Buffer.concat([
		Buffer.from("desc\0\0\0\0", "latin1"),
		count,
		ascii,
		Buffer.alloc(8),
		Buffer.alloc(2 + 1 + 67),
	]);
}

function pad4(buf: Buffer): Buffer {
	const rem = buf.length % 4;
	return rem === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - rem)]);
}

export function buildTestIccProfile(): Buffer {
	const tags: [string, Buffer][] = [
		["desc", descType("ExifCleaner test sRGB")],
		["cprt", textType("No copyright, test data")],
		["wtpt", xyzType(0.9642, 1.0, 0.8249)],
		["bkpt", xyzType(0, 0, 0)],
		[
			"chad",
			sf32Type([
				1.04788, 0.02292, -0.05019, 0.02959, 0.99048, -0.01704, -0.00922,
				0.01508, 0.75168,
			]),
		],
		["rXYZ", xyzType(0.4361, 0.2225, 0.0139)],
		["gXYZ", xyzType(0.3851, 0.7169, 0.0971)],
		["bXYZ", xyzType(0.1431, 0.0606, 0.7141)],
		["rTRC", gammaCurveType(2.2)],
		["gTRC", gammaCurveType(2.2)],
		["bTRC", gammaCurveType(2.2)],
	];

	const headerSize = 128;
	const tableSize = 4 + tags.length * 12;
	let offset = headerSize + tableSize;
	const table = Buffer.alloc(tableSize);
	table.writeUInt32BE(tags.length, 0);
	const bodies: Buffer[] = [];
	tags.forEach(([signature, data], index) => {
		const entry = 4 + index * 12;
		table.write(signature, entry, "latin1");
		table.writeUInt32BE(offset, entry + 4);
		table.writeUInt32BE(data.length, entry + 8);
		const padded = pad4(data);
		bodies.push(padded);
		offset += padded.length;
	});

	const header = Buffer.alloc(headerSize);
	header.writeUInt32BE(offset, 0); // profile size
	header.writeUInt32BE(0x02100000, 8); // version 2.1
	header.write("mntrRGB XYZ ", 12, "latin1"); // class, colour space, PCS
	header.writeUInt16BE(2026, 24); // creation date: 2026-01-01 00:00:00
	header.writeUInt16BE(1, 26);
	header.writeUInt16BE(1, 28);
	header.write("acsp", 36, "latin1");
	s15Fixed16(0.9642).copy(header, 68); // PCS illuminant D50
	s15Fixed16(1.0).copy(header, 72);
	s15Fixed16(0.8249).copy(header, 76);

	return Buffer.concat([header, table, ...bodies]);
}
