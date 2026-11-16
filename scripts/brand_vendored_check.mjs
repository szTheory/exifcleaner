// Brand asset drift check (GAT-04, D-17, D-18).
//
//   node scripts/brand_vendored_check.mjs
//
// Brand files are never committed wholesale (brand.pin.json pins one commit of the brand
// repository, and the zip is fetched into the gitignored .brand-cache/). A brand asset that
// the UI adopts is vendored as a copy under src/renderer/assets/brand/ and listed in
// brand.vendored.json as { source, target, sha256 }: `source` is a path inside the pinned
// brand zip's root, `target` is the vendored copy, `sha256` is the hash both must have.
// This check makes drift between the pin, the cache and the copies red:
//   - the cache is proved first with ensureBrand in offline mode (never the network): the
//     cached zip must equal the pin's size and sha256, or the check has no ground truth and
//     fails (`cache`);
//   - manifest.brandPin must equal the brand.pin.json commit (`pin-mismatch`);
//   - every row's source resolves inside the brand root (`source-unresolvable`) to a file in
//     the cache (`source-missing`) whose sha256 equals the row (`source-hash`);
//   - every row's target lies inside the vendored directory (`target-outside`), exists
//     (`vendored-missing`) and has the row's sha256 (`vendored-hash`);
//   - a target named twice is `duplicate-target`, and a file in the vendored directory that no
//     row names is `unlisted-vendored`, so a copy cannot be added without its pinned source.
// The manifest starts with an empty list (SUR-03 fills it in Phase 79), so today this proves
// the cache and the pin and Phase 79 becomes a data edit.
//
// The CLI is strict (D-18): an absent cache exits 1 where the cache is expected. It is the
// third command of the ci.yml step `Brand pin, quote and drift gates`, which runs
// `yarn brand:fetch` first, so the cache exists in CI. The Vitest test follows the 3-state
// rule (present: assert, absent locally: report, absent under CI: fail) and never skips.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveInRoot } from "../.storybook/catalog/closed.mjs";
import {
	CACHE_DIR_NAME,
	PIN_FILE_NAME,
	ensureBrand,
	readPin,
	sha256Hex,
} from "./brand_lib.mjs";
import { isMainModule } from "./is_main_module.mjs";

export const MANIFEST_FILE_NAME = "brand.vendored.json";
export const VENDORED_DIR = "src/renderer/assets/brand";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ROW_KEYS = ["source", "target", "sha256"];

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {string} code
 * @param {string} message
 * @returns {{ code: string, message: string }}
 */
function problem(code, message) {
	return { code, message };
}

/**
 * @param {string} directory
 * @param {string} root
 * @returns {string[]} repo-relative POSIX paths of every non-directory entry, sorted
 */
function listFiles(directory, root) {
	if (!fs.existsSync(directory)) return [];
	/** @type {string[]} */
	const found = [];
	const walk = (current) => {
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			const absolute = path.join(current, entry.name);
			if (entry.isDirectory()) walk(absolute);
			else {
				found.push(path.relative(root, absolute).split(path.sep).join("/"));
			}
		}
	};
	walk(directory);
	return found.sort();
}

/**
 * @param {string} directory
 * @param {string} candidate an absolute path
 * @returns {boolean} whether the candidate is the directory or lies below it
 */
function isInside(directory, candidate) {
	const relative = path.relative(directory, candidate);
	return (
		relative === "" ||
		(relative !== ".." &&
			!relative.startsWith(`..${path.sep}`) &&
			!path.isAbsolute(relative))
	);
}

/**
 * @param {string} file
 * @returns {Buffer | undefined} the bytes of a regular file, or undefined
 */
function readRegularFile(file) {
	const stat = fs.lstatSync(file, { throwIfNoEntry: false });
	return stat?.isFile() ? fs.readFileSync(file) : undefined;
}

/**
 * Structure first: a malformed manifest yields `manifest-shape` problems and nothing else
 * from the rows.
 *
 * @param {unknown} manifest
 * @returns {Array<{ code: string, message: string }>}
 */
function shapeProblems(manifest) {
	if (!isRecord(manifest)) {
		return [problem("manifest-shape", "the manifest is not a JSON object")];
	}
	const problems = [];
	const keys = Object.keys(manifest);
	if (keys.join(",") !== "brandPin,files") {
		problems.push(
			problem(
				"manifest-shape",
				`the manifest keys are [${keys.join(", ")}], expected [brandPin, files]`,
			),
		);
	}
	if (typeof manifest.brandPin !== "string") {
		problems.push(
			problem("manifest-shape", "manifest.brandPin is not a string"),
		);
	}
	if (!Array.isArray(manifest.files)) {
		problems.push(problem("manifest-shape", "manifest.files is not an array"));
		return problems;
	}
	manifest.files.forEach((row, index) => {
		const where = `manifest.files[${index}]`;
		if (!isRecord(row)) {
			problems.push(problem("manifest-shape", `${where} is not an object`));
			return;
		}
		if (Object.keys(row).join(",") !== ROW_KEYS.join(",")) {
			problems.push(
				problem(
					"manifest-shape",
					`${where} keys are [${Object.keys(row).join(", ")}], expected [${ROW_KEYS.join(", ")}]`,
				),
			);
			return;
		}
		for (const key of ROW_KEYS) {
			if (typeof row[key] !== "string") {
				problems.push(
					problem("manifest-shape", `${where}.${key} is not a string`),
				);
			}
		}
		if (typeof row.sha256 === "string" && !SHA256_PATTERN.test(row.sha256)) {
			problems.push(
				problem(
					"manifest-shape",
					`${where}.sha256 is not 64 lowercase hex characters`,
				),
			);
		}
	});
	return problems;
}

/**
 * Pure over the files it reads: no network (ensureBrand runs offline), no writes outside the
 * cache directory (ensureBrand may unpack into it).
 *
 * @param {{ root: string, pin: import("./brand_lib.mjs").BrandPin, manifest: unknown, cacheDir: string, vendoredDir: string }} args
 * @returns {Promise<Array<{ code: string, message: string }>>}
 */
export async function vendoredProblems({
	root,
	pin,
	manifest,
	cacheDir,
	vendoredDir,
}) {
	/** @type {Array<{ code: string, message: string }>} */
	const problems = [];

	/** @type {string | undefined} */
	let brandRoot;
	try {
		({ brandRoot } = await ensureBrand({ pin, cacheDir, mode: "offline" }));
	} catch (error) {
		problems.push(
			problem(
				"cache",
				`the brand cache is not valid against brand.pin.json: ${error instanceof Error ? error.message : String(error)}`,
			),
		);
	}

	const shape = shapeProblems(manifest);
	problems.push(...shape);
	if (shape.length > 0 || !isRecord(manifest)) return problems;

	if (manifest.brandPin !== pin.commit) {
		problems.push(
			problem(
				"pin-mismatch",
				`manifest.brandPin ${String(manifest.brandPin)} is not the ${PIN_FILE_NAME} commit ${pin.commit}`,
			),
		);
	}

	const listed = new Set();
	for (const row of manifest.files) {
		const { source, target, sha256 } = row;
		const targetPath = resolveInRoot(root, target);
		// The listed set holds the normalised repo-relative path, the form listFiles returns.
		const normalised =
			targetPath === null
				? target
				: path.relative(root, targetPath).split(path.sep).join("/");
		if (listed.has(normalised)) {
			problems.push(
				problem("duplicate-target", `${target} is listed by more than one row`),
			);
			continue;
		}
		listed.add(normalised);

		if (brandRoot !== undefined) {
			const sourcePath = resolveInRoot(brandRoot, source);
			if (sourcePath === null) {
				problems.push(
					problem(
						"source-unresolvable",
						`${source} does not resolve inside the brand root`,
					),
				);
			} else {
				const bytes = readRegularFile(sourcePath);
				if (bytes === undefined) {
					problems.push(
						problem(
							"source-missing",
							`${source} is not a file in the cached brand`,
						),
					);
				} else if (sha256Hex(bytes) !== sha256) {
					problems.push(
						problem(
							"source-hash",
							`${source} in the cached brand hashes to ${sha256Hex(bytes)}, the row says ${sha256}`,
						),
					);
				}
			}
		}

		if (targetPath === null || !isInside(vendoredDir, targetPath)) {
			problems.push(
				problem(
					"target-outside",
					`${target} is not a path inside ${path.relative(root, vendoredDir).split(path.sep).join("/")}`,
				),
			);
			continue;
		}
		const vendored = readRegularFile(targetPath);
		if (vendored === undefined) {
			problems.push(
				problem("vendored-missing", `${target} is listed but is not a file`),
			);
		} else if (sha256Hex(vendored) !== sha256) {
			problems.push(
				problem(
					"vendored-hash",
					`${target} hashes to ${sha256Hex(vendored)}, the row says ${sha256}`,
				),
			);
		}
	}

	for (const file of listFiles(vendoredDir, root)) {
		if (!listed.has(file)) {
			problems.push(
				problem(
					"unlisted-vendored",
					`${file} is vendored but has no row in ${MANIFEST_FILE_NAME}`,
				),
			);
		}
	}
	return problems;
}

/**
 * The strict CLI body: exit code 1 on any problem, on an unreadable pin or manifest, and on an
 * absent cache (the cache problem above). Never throws for a bad input file.
 *
 * @param {{ root?: string, log?: (line: string) => void, error?: (line: string) => void }} [options]
 * @returns {Promise<number>}
 */
export async function main({
	root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
	log = console.log,
	error = console.error,
} = {}) {
	let pin;
	let manifest;
	try {
		pin = readPin(path.join(root, PIN_FILE_NAME));
		manifest = JSON.parse(
			fs.readFileSync(path.join(root, MANIFEST_FILE_NAME), "utf8"),
		);
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		error(
			`brand-vendored: manifest: cannot read ${PIN_FILE_NAME} or ${MANIFEST_FILE_NAME}: ${message}`,
		);
		error("✗ BRAND VENDORED CHECK FAILED");
		return 1;
	}
	const problems = await vendoredProblems({
		root,
		pin,
		manifest,
		cacheDir: path.join(root, CACHE_DIR_NAME),
		vendoredDir: path.join(root, VENDORED_DIR),
	});
	if (problems.length > 0) {
		for (const found of problems) {
			error(`brand-vendored: ${found.code}: ${found.message}`);
		}
		error("✗ BRAND VENDORED CHECK FAILED");
		return 1;
	}
	log(
		`BRAND VENDORED CHECK PASSED (${manifest.files.length} files, pin ${pin.commit.slice(0, 7)})`,
	);
	return 0;
}

if (isMainModule(import.meta.url)) {
	process.exitCode = await main();
}
