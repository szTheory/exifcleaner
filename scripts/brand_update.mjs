// yarn brand:update [<commit-sha>]
//
// Re-pins the brand assets. With no argument it resolves the latest main commit of
// szTheory/exifcleaner-brand (GITHUB_TOKEN is used if set, to avoid API rate limits), downloads
// the committed exifcleaner-brand.zip at that commit, computes its size and sha256, proves it
// unpacks, and rewrites brand.pin.json so the brand change is one reviewable diff. The
// downloaded zip also seeds the cache, so the next build is a cache hit.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	BRAND_REPO,
	CACHE_DIR_NAME,
	PIN_FILE_NAME,
	ZIP_FILE_NAME,
	computePin,
	describePin,
	resolveLatestCommit,
	writePin,
} from "./brand_lib.mjs";

export async function runBrandUpdate({
	argv,
	env = process.env,
	root,
	fetchBytes,
	log = console.log,
}) {
	const pinPath = env.BRAND_PIN_FILE ?? path.join(root, PIN_FILE_NAME);
	const cacheDir = env.BRAND_CACHE_DIR ?? path.join(root, CACHE_DIR_NAME);
	const requested = argv[0];
	const commit =
		requested ??
		(await resolveLatestCommit({
			repo: BRAND_REPO,
			token: env.GITHUB_TOKEN,
			...(fetchBytes === undefined ? {} : { fetchBytes }),
		}));
	const { pin, bytes } = await computePin({
		repo: BRAND_REPO,
		commit,
		...(fetchBytes === undefined ? {} : { fetchBytes }),
	});
	writePin(pinPath, pin);
	fs.mkdirSync(cacheDir, { recursive: true });
	fs.writeFileSync(path.join(cacheDir, ZIP_FILE_NAME), bytes);
	log(
		`brand: pinned ${describePin(pin)} (${pin.size} bytes, sha256 ${pin.sha256})`,
	);
	log(
		`brand: wrote ${path.relative(root, pinPath)}; review the diff and commit it`,
	);
	return pin;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
	runBrandUpdate({ argv: process.argv.slice(2), root }).catch((error) => {
		console.error(`brand: update FAILED: ${error.message}`);
		process.exit(1);
	});
}
