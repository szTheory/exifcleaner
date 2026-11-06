// Prebuild step: make the pinned brand assets available without ever committing them.
//
//   node scripts/brand_fetch.mjs
//
// Environment:
//   BRAND_FETCH=online   (default) download the pinned zip when the cache is missing or stale
//   BRAND_FETCH=offline  never touch the network; the cached zip must already match the pin
//   BRAND_FETCH=skip     do nothing (for jobs that neither need nor can fetch brand assets);
//                        the shipped brand/ resources are then absent from packaged builds
//   BRAND_PIN_FILE, BRAND_CACHE_DIR  override the pin file and cache dir (tests)
//
// A size or sha256 mismatch, an unreadable zip, or a missing licence always exits non-zero.
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import {
	ALLOWLIST_FILE_NAME,
	BrandError,
	CACHE_DIR_NAME,
	PIN_FILE_NAME,
	ensureBrand,
	describePin,
	readPin,
	shipBrand,
} from "./brand_lib.mjs";

export async function runBrandFetch({
	env = process.env,
	root,
	log = console.log,
}) {
	const mode = env.BRAND_FETCH ?? "online";
	if (mode === "skip") {
		log("brand: BRAND_FETCH=skip, not fetching brand assets");
		return { skipped: true };
	}
	if (mode !== "online" && mode !== "offline") {
		throw new BrandError(
			`BRAND_FETCH must be online, offline or skip (got ${JSON.stringify(mode)})`,
		);
	}
	const pin = readPin(env.BRAND_PIN_FILE ?? path.join(root, PIN_FILE_NAME));
	const cacheDir = env.BRAND_CACHE_DIR ?? path.join(root, CACHE_DIR_NAME);
	const result = await ensureBrand({
		pin,
		cacheDir,
		mode,
		log: (line) => log(`brand: ${line}`),
	});
	const allowlistPath = path.join(root, ALLOWLIST_FILE_NAME);
	const shipped = shipBrand({
		brandRoot: result.brandRoot,
		allowlistText: fs.readFileSync(allowlistPath, "utf8"),
		outDir: path.join(cacheDir, "ship"),
	});
	log(
		`brand: ${describePin(pin)} ready, ${shipped.length} file(s) staged for packaging`,
	);
	return { skipped: false, shipped, ...result };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
	runBrandFetch({ root }).catch((error) => {
		console.error(`brand: FAILED: ${error.message}`);
		process.exit(1);
	});
}
