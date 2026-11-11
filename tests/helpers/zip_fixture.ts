import zlib from "node:zlib";

export interface ZipFixtureEntry {
	name: string;
	data?: string | Buffer;
	// "deflate" (default) or "store"; directories ignore it.
	method?: "deflate" | "store";
	// Unix st_mode stored in the external attributes (default: regular file / directory).
	mode?: number;
	// Corrupt the stored CRC to prove the extractor checks it.
	badCrc?: boolean;
}

// Minimal zip writer for tests: the repo has no zip dependency and the extractor under test
// must be exercised against archives whose contents are known byte for byte.
export function buildZip(entries: ZipFixtureEntry[]): Buffer {
	const locals: Buffer[] = [];
	const centrals: Buffer[] = [];
	let offset = 0;
	for (const entry of entries) {
		const name = Buffer.from(entry.name, "utf8");
		const isDirectory = entry.name.endsWith("/");
		const raw = isDirectory ? Buffer.alloc(0) : Buffer.from(entry.data ?? "");
		const method = isDirectory || entry.method === "store" ? 0 : 8;
		const body = method === 8 ? zlib.deflateRawSync(raw) : raw;
		const crc = (zlib.crc32(raw) ^ (entry.badCrc ? 1 : 0)) >>> 0;
		const mode = entry.mode ?? (isDirectory ? 0o040755 : 0o100644);

		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(method, 8);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(body.length, 18);
		local.writeUInt32LE(raw.length, 22);
		local.writeUInt16LE(name.length, 26);
		locals.push(local, name, body);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE((3 << 8) | 20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(method, 10);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(body.length, 20);
		central.writeUInt32LE(raw.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt32LE((mode << 16) >>> 0, 38);
		central.writeUInt32LE(offset, 42);
		centrals.push(central, name);
		offset += 30 + name.length + body.length;
	}
	const centralBytes = Buffer.concat(centrals);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralBytes.length, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, centralBytes, end]);
}

export const BRAND_FIXTURE_ENTRIES: ZipFixtureEntry[] = [
	{ name: "exifcleaner-brand/" },
	{ name: "exifcleaner-brand/BRAND.md", data: "# brand\n".repeat(50) },
	{
		name: "exifcleaner-brand/assets/fonts/OFL-Alpha.txt",
		data: "OFL Alpha licence\n",
	},
	{
		name: "exifcleaner-brand/assets/fonts/OFL-Beta.txt",
		data: "OFL Beta licence\n",
		method: "store",
	},
	{
		name: "exifcleaner-brand/assets/fonts/static/Alpha-Regular.ttf",
		data: "FONT-BYTES",
	},
	{ name: "exifcleaner-brand/assets/logo/mark.svg", data: "<svg/>" },
];
