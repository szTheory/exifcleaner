// Pinned brand-asset fetch (library). The app repo never commits brand files: brand.pin.json
// pins one commit of szTheory/exifcleaner-brand plus the size and sha256 of the committed
// exifcleaner-brand.zip at that commit. Everything here is dependency-free (node:* only) and
// takes its network, directories and clock as arguments so tests run with local fixtures.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

export const PIN_FILE_NAME = "brand.pin.json";
export const ALLOWLIST_FILE_NAME = "brand.ship.allowlist";
export const CACHE_DIR_NAME = ".brand-cache";
export const ZIP_FILE_NAME = "exifcleaner-brand.zip";
export const ZIP_ROOT = "exifcleaner-brand";
export const BRAND_REPO = "szTheory/exifcleaner-brand";

const FULL_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MARKER_FILE = ".pin-sha256";
// The OFL font licenses are redistribution obligations, so they ship unconditionally and the
// ship step fails closed if none are found.
const LICENSE_DIR = "assets/fonts";
const LICENSE_PREFIX = "OFL-";

export class BrandError extends Error {
	constructor(message) {
		super(message);
		this.name = "BrandError";
	}
}

export function pinUrl(repo, commit) {
	return `https://raw.githubusercontent.com/${repo}/${commit}/${ZIP_FILE_NAME}`;
}

export function validatePin(pin) {
	if (pin === null || typeof pin !== "object" || Array.isArray(pin)) {
		throw new BrandError("brand pin must be a JSON object");
	}
	const { repo, commit, url, sha256, size, root } = pin;
	if (typeof repo !== "string" || !REPO.test(repo)) {
		throw new BrandError("brand pin: repo must be owner/name");
	}
	if (typeof commit !== "string" || !FULL_SHA.test(commit)) {
		throw new BrandError("brand pin: commit must be a full 40-character SHA");
	}
	if (url !== pinUrl(repo, commit)) {
		throw new BrandError(
			`brand pin: url must be exactly ${pinUrl(repo, commit)} (the committed zip at the pinned commit, never a generated archive)`,
		);
	}
	if (typeof sha256 !== "string" || !SHA256.test(sha256)) {
		throw new BrandError(
			"brand pin: sha256 must be 64 lowercase hex characters",
		);
	}
	if (!Number.isSafeInteger(size) || size <= 0) {
		throw new BrandError("brand pin: size must be a positive integer");
	}
	if (root !== ZIP_ROOT) {
		throw new BrandError(`brand pin: root must be ${ZIP_ROOT}`);
	}
	return { repo, commit, url, sha256, size, root };
}

export function readPin(pinPath) {
	let raw;
	try {
		raw = fs.readFileSync(pinPath, "utf8");
	} catch (error) {
		throw new BrandError(`cannot read brand pin ${pinPath}: ${error.message}`);
	}
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new BrandError(
			`brand pin ${pinPath} is not valid JSON: ${error.message}`,
		);
	}
	return validatePin(parsed);
}

// Stable key order and a trailing newline, so every brand change is a minimal reviewable diff.
export function serializePin(pin) {
	const { repo, commit, url, sha256, size, root } = validatePin(pin);
	return `${JSON.stringify({ repo, commit, url, sha256, size, root }, null, "\t")}\n`;
}

export function writePin(pinPath, pin) {
	fs.writeFileSync(pinPath, serializePin(pin));
}

export function sha256Hex(bytes) {
	return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function describePin(pin) {
	return `${pin.repo}@${pin.commit.slice(0, 12)}`;
}

// Throws unless the bytes are exactly the pinned artifact. Size is checked first so a
// truncated or swapped download is named as such before hashing.
export function verifyBytes(bytes, pin, label = "brand zip") {
	if (bytes.length !== pin.size) {
		throw new BrandError(
			`${label}: size mismatch, expected ${pin.size} bytes, got ${bytes.length}`,
		);
	}
	const actual = sha256Hex(bytes);
	if (actual !== pin.sha256) {
		throw new BrandError(
			`${label}: sha256 mismatch, expected ${pin.sha256}, got ${actual}`,
		);
	}
}

// ---------------------------------------------------------------------------------------
// Minimal zip reader. The brand zip is produced by the brand repo (stored + deflate, no
// zip64, no encryption). Extraction needs only node:zlib, so no archive dependency is added
// to a repo whose production dependency list is deliberately three packages, and nothing
// depends on a system `unzip` (absent on Windows runners). Anything outside that profile is
// rejected rather than guessed at.
// ---------------------------------------------------------------------------------------
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const S_IFMT = 0o170000;
const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;

function fail(message) {
	throw new BrandError(`unzip failed: ${message}`);
}

export function readZipEntries(buffer) {
	if (buffer.length < 22) fail("archive is too small to be a zip");
	let eocd = -1;
	const lowest = Math.max(0, buffer.length - 22 - 0xffff);
	for (let at = buffer.length - 22; at >= lowest; at--) {
		if (buffer.readUInt32LE(at) === EOCD_SIGNATURE) {
			eocd = at;
			break;
		}
	}
	if (eocd < 0) fail("end of central directory not found");
	const total = buffer.readUInt16LE(eocd + 10);
	const centralSize = buffer.readUInt32LE(eocd + 12);
	const centralOffset = buffer.readUInt32LE(eocd + 16);
	if (
		total === 0xffff ||
		centralSize === 0xffffffff ||
		centralOffset === 0xffffffff
	) {
		fail("zip64 archives are not supported");
	}
	if (centralOffset + centralSize > eocd)
		fail("central directory out of range");

	const entries = [];
	let cursor = centralOffset;
	for (let index = 0; index < total; index++) {
		if (
			cursor + 46 > buffer.length ||
			buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE
		) {
			fail("corrupt central directory");
		}
		const flags = buffer.readUInt16LE(cursor + 8);
		const method = buffer.readUInt16LE(cursor + 10);
		const crc = buffer.readUInt32LE(cursor + 16);
		const compressedSize = buffer.readUInt32LE(cursor + 20);
		const size = buffer.readUInt32LE(cursor + 24);
		const nameLength = buffer.readUInt16LE(cursor + 28);
		const extraLength = buffer.readUInt16LE(cursor + 30);
		const commentLength = buffer.readUInt16LE(cursor + 32);
		const attributes = buffer.readUInt32LE(cursor + 38);
		const localOffset = buffer.readUInt32LE(cursor + 42);
		const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
		if (
			compressedSize === 0xffffffff ||
			size === 0xffffffff ||
			localOffset === 0xffffffff
		) {
			fail(`zip64 entry is not supported: ${name}`);
		}
		const hostUnix = buffer.readUInt16LE(cursor + 4) >> 8 === 3;
		entries.push({
			name,
			flags,
			method,
			crc,
			compressedSize,
			size,
			localOffset,
			unixMode: hostUnix ? (attributes >>> 16) & 0xffff : 0,
		});
		cursor += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
}

// A zip entry name is attacker-influenced input: reject anything that could land outside the
// destination (zip-slip) rather than sanitizing it.
export function safeEntryPath(name) {
	if (name.length === 0 || name.includes("\0") || name.includes("\\")) {
		fail(`unsafe entry name: ${JSON.stringify(name)}`);
	}
	if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) {
		fail(`absolute entry name: ${name}`);
	}
	const parts = name
		.split("/")
		.filter((part, i, all) => part !== "" || i === all.length - 1);
	if (parts.some((part) => part === ".." || part === ".")) {
		fail(`path traversal entry name: ${name}`);
	}
	return parts.filter((part) => part !== "").join("/");
}

export function extractZip(buffer, destination) {
	const entries = readZipEntries(buffer);
	const root = path.resolve(destination);
	fs.mkdirSync(root, { recursive: true });
	for (const entry of entries) {
		if (entry.flags & 0x1) fail(`encrypted entry: ${entry.name}`);
		const relative = safeEntryPath(entry.name);
		const target = path.resolve(root, relative);
		if (target !== root && !target.startsWith(root + path.sep)) {
			fail(`entry escapes destination: ${entry.name}`);
		}
		const kind = entry.unixMode & S_IFMT;
		const isDirectory = entry.name.endsWith("/") || kind === S_IFDIR;
		if (isDirectory) {
			fs.mkdirSync(target, { recursive: true });
			continue;
		}
		if (kind !== 0 && kind !== S_IFREG)
			fail(`non-regular entry (symlink?): ${entry.name}`);
		if (
			entry.localOffset + 30 > buffer.length ||
			buffer.readUInt32LE(entry.localOffset) !== LOCAL_SIGNATURE
		) {
			fail(`corrupt local header: ${entry.name}`);
		}
		const dataStart =
			entry.localOffset +
			30 +
			buffer.readUInt16LE(entry.localOffset + 26) +
			buffer.readUInt16LE(entry.localOffset + 28);
		const compressed = buffer.subarray(
			dataStart,
			dataStart + entry.compressedSize,
		);
		if (compressed.length !== entry.compressedSize)
			fail(`truncated entry: ${entry.name}`);
		let data;
		if (entry.method === 0) {
			data = compressed;
		} else if (entry.method === 8) {
			try {
				data = zlib.inflateRawSync(compressed);
			} catch (error) {
				fail(`cannot inflate ${entry.name}: ${error.message}`);
			}
		} else {
			fail(`unsupported compression method ${entry.method}: ${entry.name}`);
		}
		if (data.length !== entry.size)
			fail(`size mismatch inside archive: ${entry.name}`);
		if (zlib.crc32(data) !== entry.crc)
			fail(`crc mismatch inside archive: ${entry.name}`);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, data);
	}
	return entries.length;
}

// ---------------------------------------------------------------------------------------
// Fetch: cache-first, verify-always, fail closed.
// ---------------------------------------------------------------------------------------
// Cap for downloads whose size is not pinned (the latest-commit SHA text, a freshly
// computed pin). The pinned zip is capped at its pinned size instead.
export const UNPINNED_MAX_BYTES = 64 * 1024 * 1024;

// Download with a few retries on transport and HTTP failures, and a hard size cap that
// aborts while streaming. A size-cap breach is never retried, and checksum verification
// happens outside this function, so a wrong archive is never retried either.
export async function defaultFetchBytes(
	url,
	{
		timeoutMs = 60_000,
		headers,
		maxBytes = UNPINNED_MAX_BYTES,
		attempts = 3,
		fetchImpl = fetch,
		delayMs = 500,
	} = {},
) {
	let lastError;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		let overCap = false;
		try {
			const response = await fetchImpl(url, {
				redirect: "follow",
				signal: AbortSignal.timeout(timeoutMs),
				...(headers === undefined ? {} : { headers }),
			});
			if (!response.ok) {
				throw new BrandError(`GET ${url} failed: HTTP ${response.status}`);
			}
			const chunks = [];
			let total = 0;
			for await (const chunk of response.body) {
				total += chunk.length;
				if (total > maxBytes) {
					overCap = true;
					throw new BrandError(
						`GET ${url} exceeds the size cap (${maxBytes} bytes)`,
					);
				}
				chunks.push(chunk);
			}
			return Buffer.concat(chunks);
		} catch (error) {
			lastError = error;
			if (overCap) break;
			if (attempt < attempts) {
				await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
			}
		}
	}
	throw lastError instanceof BrandError
		? lastError
		: new BrandError(`GET ${url} failed: ${lastError?.message ?? lastError}`);
}

function atomicWrite(file, bytes) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const temporary = `${file}.${process.pid}.tmp`;
	fs.writeFileSync(temporary, bytes);
	fs.renameSync(temporary, file);
}

function readIfPresent(file) {
	try {
		return fs.readFileSync(file);
	} catch (error) {
		if (error.code === "ENOENT") return undefined;
		throw error;
	}
}

// mode "online": download when the cached zip is absent or does not match the pin.
// mode "offline": never touch the network; the cached zip must already match the pin.
// A downloaded zip that does not match the pin is never written to the cache and always throws.
export async function ensureBrand({
	pin,
	cacheDir,
	mode = "online",
	fetchBytes = defaultFetchBytes,
	log = () => {},
}) {
	const zipPath = path.join(cacheDir, ZIP_FILE_NAME);
	let downloaded = false;
	const cached = readIfPresent(zipPath);
	let cacheHit = false;
	if (cached !== undefined) {
		try {
			verifyBytes(cached, pin, "cached brand zip");
			cacheHit = true;
		} catch (error) {
			if (mode === "offline") throw error;
			log(
				`cached brand zip does not match the pin (${error.message}); re-downloading`,
			);
		}
	} else if (mode === "offline") {
		throw new BrandError(
			`offline mode: no cached brand zip at ${zipPath} (run yarn brand:fetch with network once)`,
		);
	}

	let bytes = cached;
	if (!cacheHit) {
		log(`downloading ${pin.url}`);
		try {
			bytes = await fetchBytes(pin.url, { maxBytes: pin.size });
		} catch (error) {
			if (error instanceof BrandError) throw error;
			throw new BrandError(`cannot download ${pin.url}: ${error.message}`);
		}
		verifyBytes(bytes, pin, "downloaded brand zip");
		atomicWrite(zipPath, bytes);
		downloaded = true;
	} else {
		log(`cache hit, sha256 verified (${describePin(pin)})`);
	}

	const unpackedDir = path.join(cacheDir, "unpacked");
	const marker = path.join(unpackedDir, MARKER_FILE);
	const markerValue = readIfPresent(marker)?.toString("utf8").trim();
	let extracted = false;
	if (markerValue !== pin.sha256) {
		const staging = `${unpackedDir}.${process.pid}.tmp`;
		fs.rmSync(staging, { recursive: true, force: true });
		extractZip(bytes, staging);
		if (
			!fs
				.statSync(path.join(staging, pin.root), { throwIfNoEntry: false })
				?.isDirectory()
		) {
			fs.rmSync(staging, { recursive: true, force: true });
			throw new BrandError(
				`unzip failed: archive has no ${pin.root}/ directory`,
			);
		}
		fs.writeFileSync(path.join(staging, MARKER_FILE), `${pin.sha256}\n`);
		fs.rmSync(unpackedDir, { recursive: true, force: true });
		fs.renameSync(staging, unpackedDir);
		extracted = true;
	}
	return {
		zipPath,
		unpackedDir,
		brandRoot: path.join(unpackedDir, pin.root),
		downloaded,
		extracted,
	};
}

// ---------------------------------------------------------------------------------------
// Ship: copy only the files the app uses, plus the OFL licenses, into a flat staging dir.
// ---------------------------------------------------------------------------------------
export function parseAllowlist(text) {
	const entries = [];
	for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
		const line = rawLine.replace(/#.*$/, "").trim();
		if (line === "") continue;
		if (
			line.startsWith("/") ||
			line.includes("\\") ||
			line.split("/").includes("..")
		) {
			throw new BrandError(
				`allowlist line ${index + 1}: unsafe path ${JSON.stringify(line)}`,
			);
		}
		entries.push(line);
	}
	return entries;
}

function listFiles(directory, base = directory) {
	const files = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const full = path.join(directory, entry.name);
		if (entry.isDirectory()) files.push(...listFiles(full, base));
		else if (entry.isFile())
			files.push(path.relative(base, full).split(path.sep).join("/"));
	}
	return files.sort();
}

export function shipBrand({ brandRoot, allowlistText, outDir }) {
	const allowlist = parseAllowlist(allowlistText);
	const licenseDir = path.join(brandRoot, ...LICENSE_DIR.split("/"));
	const licenses = fs.existsSync(licenseDir)
		? fs
				.readdirSync(licenseDir)
				.filter(
					(name) => name.startsWith(LICENSE_PREFIX) && name.endsWith(".txt"),
				)
				.map((name) => `${LICENSE_DIR}/${name}`)
		: [];
	if (licenses.length === 0) {
		throw new BrandError(
			`no ${LICENSE_PREFIX}*.txt font licenses under ${LICENSE_DIR}/; refusing to ship brand assets without them`,
		);
	}
	const wanted = [...new Set([...licenses, ...allowlist])].sort();
	const missing = wanted.filter((relative) => {
		const stat = fs.statSync(path.join(brandRoot, relative), {
			throwIfNoEntry: false,
		});
		return stat === undefined || !stat.isFile();
	});
	if (missing.length > 0) {
		throw new BrandError(
			`allowlisted brand files not found in the pinned brand: ${missing.join(", ")}`,
		);
	}
	fs.rmSync(outDir, { recursive: true, force: true });
	for (const relative of wanted) {
		const target = path.join(outDir, ...relative.split("/"));
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.copyFileSync(path.join(brandRoot, ...relative.split("/")), target);
	}
	return listFiles(outDir);
}

// ---------------------------------------------------------------------------------------
// Update: compute a new pin from a commit. Used by `yarn brand:update`.
// ---------------------------------------------------------------------------------------
export async function resolveLatestCommit({
	repo = BRAND_REPO,
	fetchBytes = defaultFetchBytes,
	token,
} = {}) {
	const headers = {
		Accept: "application/vnd.github.sha",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "exifcleaner-brand-update",
		...(token ? { Authorization: `Bearer ${token}` } : {}),
	};
	const bytes = await fetchBytes(
		`https://api.github.com/repos/${repo}/commits/main`,
		{
			headers,
			maxBytes: UNPINNED_MAX_BYTES,
		},
	);
	const sha = bytes.toString("utf8").trim();
	if (!FULL_SHA.test(sha)) {
		throw new BrandError(
			`could not resolve latest ${repo} main commit (got ${JSON.stringify(sha.slice(0, 80))})`,
		);
	}
	return sha;
}

export async function computePin({
	repo = BRAND_REPO,
	commit,
	fetchBytes = defaultFetchBytes,
}) {
	if (!FULL_SHA.test(commit)) {
		throw new BrandError("commit must be a full 40-character lowercase SHA");
	}
	const url = pinUrl(repo, commit);
	const bytes = await fetchBytes(url, { maxBytes: UNPINNED_MAX_BYTES });
	const pin = {
		repo,
		commit,
		url,
		sha256: sha256Hex(bytes),
		size: bytes.length,
		root: ZIP_ROOT,
	};
	// Refuse to pin an archive this tooling cannot unpack.
	const probe = fs.mkdtempSync(path.join(os.tmpdir(), "brand-probe-"));
	try {
		extractZip(bytes, probe);
		if (
			!fs
				.statSync(path.join(probe, ZIP_ROOT), { throwIfNoEntry: false })
				?.isDirectory()
		) {
			throw new BrandError(
				`unzip failed: archive has no ${ZIP_ROOT}/ directory`,
			);
		}
	} finally {
		fs.rmSync(probe, { recursive: true, force: true });
	}
	return { pin: validatePin(pin), bytes };
}
