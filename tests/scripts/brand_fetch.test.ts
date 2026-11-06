import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	BRAND_REPO,
	BrandError,
	ZIP_FILE_NAME,
	computePin,
	ensureBrand,
	extractZip,
	parseAllowlist,
	pinUrl,
	readPin,
	resolveLatestCommit,
	serializePin,
	sha256Hex,
	shipBrand,
	validatePin,
	verifyBytes,
	type BrandPin,
	type FetchBytes,
} from "../../scripts/brand_lib.mjs";
import { runBrandFetch } from "../../scripts/brand_fetch.mjs";
import { runBrandUpdate } from "../../scripts/brand_update.mjs";
import {
	BRAND_FIXTURE_ENTRIES,
	buildZip,
	type ZipFixtureEntry,
} from "../helpers/zip_fixture";

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const COMMIT = "a".repeat(40);
const NEXT_COMMIT = "b".repeat(40);

function pinFor(bytes: Buffer, commit = COMMIT): BrandPin {
	return {
		repo: BRAND_REPO,
		commit,
		url: pinUrl(BRAND_REPO, commit),
		sha256: sha256Hex(bytes),
		size: bytes.length,
		root: "exifcleaner-brand",
	};
}

// No test touches the network: any fetch is an in-memory fixture and the default is a trap.
const neverFetch: FetchBytes = async (url) => {
	throw new Error(`unexpected network access: ${url}`);
};

let tmp: string;
beforeEach(() => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brand-test-"));
});
afterEach(() => {
	fs.rmSync(tmp, { recursive: true, force: true });
});

const goodZip = buildZip(BRAND_FIXTURE_ENTRIES);

function seedCache(cacheDir: string, bytes: Buffer): void {
	fs.mkdirSync(cacheDir, { recursive: true });
	fs.writeFileSync(path.join(cacheDir, ZIP_FILE_NAME), bytes);
}

describe("brand pin", () => {
	test("the committed brand.pin.json is valid and pins the committed zip, not a generated archive", () => {
		const pin = readPin(path.join(repoRoot, "brand.pin.json"));
		expect(pin.url).toBe(pinUrl(pin.repo, pin.commit));
		expect(pin.url).toMatch(
			/^https:\/\/raw\.githubusercontent\.com\/.+\/exifcleaner-brand\.zip$/,
		);
	});

	test("serialization is stable: tab indent, fixed key order, trailing newline", () => {
		const pin = pinFor(goodZip);
		const text = serializePin(pin);
		expect(text.endsWith("}\n")).toBe(true);
		expect(Object.keys(JSON.parse(text))).toEqual([
			"repo",
			"commit",
			"url",
			"sha256",
			"size",
			"root",
		]);
		expect(text).toContain('\n\t"commit"');
		expect(serializePin(JSON.parse(text))).toBe(text);
	});

	test.each([
		["short commit", { commit: "abc123" }],
		[
			"generated archive url",
			{ url: `https://github.com/${BRAND_REPO}/archive/${COMMIT}.zip` },
		],
		["url for another commit", { url: pinUrl(BRAND_REPO, NEXT_COMMIT) }],
		["uppercase sha256", { sha256: "A".repeat(64) }],
		["zero size", { size: 0 }],
		["string size", { size: "12" }],
		["wrong root", { root: "other" }],
	])("rejects %s", (_name, override) => {
		expect(() => validatePin({ ...pinFor(goodZip), ...override })).toThrow(
			BrandError,
		);
	});
});

describe("checksum verification", () => {
	test("accepts the exact artifact", () => {
		expect(() => verifyBytes(goodZip, pinFor(goodZip))).not.toThrow();
	});

	test("rejects a size mismatch before hashing", () => {
		const pin = pinFor(goodZip);
		expect(() => verifyBytes(goodZip.subarray(0, -1), pin)).toThrow(
			/size mismatch/,
		);
	});

	test("rejects a same-size content change (single flipped byte)", () => {
		const pin = pinFor(goodZip);
		const flipped = Buffer.from(goodZip);
		flipped[40] = (flipped[40] ?? 0) ^ 0xff;
		expect(flipped.length).toBe(pin.size);
		expect(() => verifyBytes(flipped, pin)).toThrow(/sha256 mismatch/);
	});
});

describe("ensureBrand", () => {
	test("downloads once, verifies, writes the cache and unpacks", async () => {
		const cacheDir = path.join(tmp, "cache");
		const pin = pinFor(goodZip);
		const urls: string[] = [];
		const result = await ensureBrand({
			pin,
			cacheDir,
			fetchBytes: async (url) => {
				urls.push(url);
				return goodZip;
			},
		});
		expect(urls).toEqual([pin.url]);
		expect(result.downloaded).toBe(true);
		expect(result.extracted).toBe(true);
		expect(
			fs.readFileSync(path.join(cacheDir, ZIP_FILE_NAME)).equals(goodZip),
		).toBe(true);
		expect(
			fs.readFileSync(
				path.join(result.brandRoot, "assets/logo/mark.svg"),
				"utf8",
			),
		).toBe("<svg/>");
	});

	test("cache hit skips the download entirely and works with no network", async () => {
		const cacheDir = path.join(tmp, "cache");
		const pin = pinFor(goodZip);
		await ensureBrand({ pin, cacheDir, fetchBytes: async () => goodZip });
		const second = await ensureBrand({ pin, cacheDir, fetchBytes: neverFetch });
		expect(second.downloaded).toBe(false);
		expect(second.extracted).toBe(false);
	});

	test("offline mode succeeds from a matching cache and never fetches", async () => {
		const cacheDir = path.join(tmp, "cache");
		seedCache(cacheDir, goodZip);
		const result = await ensureBrand({
			pin: pinFor(goodZip),
			cacheDir,
			mode: "offline",
			fetchBytes: neverFetch,
		});
		expect(result.downloaded).toBe(false);
		expect(fs.existsSync(path.join(result.brandRoot, "BRAND.md"))).toBe(true);
	});

	test("a download that does not match the pin fails and is not cached or unpacked", async () => {
		const cacheDir = path.join(tmp, "cache");
		const pin = pinFor(goodZip);
		const tampered = buildZip([
			...BRAND_FIXTURE_ENTRIES,
			{ name: "exifcleaner-brand/evil.txt", data: "x" },
		]);
		await expect(
			ensureBrand({ pin, cacheDir, fetchBytes: async () => tampered }),
		).rejects.toThrow(/mismatch/);
		expect(fs.existsSync(cacheDir)).toBe(false);
	});

	test("a download of the wrong size fails closed", async () => {
		const pin = pinFor(goodZip);
		await expect(
			ensureBrand({
				pin,
				cacheDir: path.join(tmp, "cache"),
				fetchBytes: async () => goodZip.subarray(0, 100),
			}),
		).rejects.toThrow(/size mismatch/);
	});

	test("a failed download is a BrandError, not a silent skip", async () => {
		await expect(
			ensureBrand({
				pin: pinFor(goodZip),
				cacheDir: path.join(tmp, "cache"),
				fetchBytes: async () => {
					throw new Error("getaddrinfo ENOTFOUND");
				},
			}),
		).rejects.toThrow(BrandError);
	});

	test("an archive that is not a zip is rejected even when its checksum matches the pin", async () => {
		const garbage = Buffer.from(
			"not a zip at all, but long enough to scan for a directory",
		);
		await expect(
			ensureBrand({
				pin: pinFor(garbage),
				cacheDir: path.join(tmp, "cache"),
				fetchBytes: async () => garbage,
			}),
		).rejects.toThrow(/unzip failed/);
	});

	test("an archive without the exifcleaner-brand/ root is rejected", async () => {
		const wrongRoot = buildZip([{ name: "other/file.txt", data: "x" }]);
		await expect(
			ensureBrand({
				pin: pinFor(wrongRoot),
				cacheDir: path.join(tmp, "cache"),
				fetchBytes: async () => wrongRoot,
			}),
		).rejects.toThrow(/no exifcleaner-brand\/ directory/);
	});

	describe("negative control: a corrupted cache never builds", () => {
		const corrupt = (): Buffer => {
			const flipped = Buffer.from(goodZip);
			flipped[60] = (flipped[60] ?? 0) ^ 0xff;
			return flipped;
		};

		test("corrupt cache + offline mode fails", async () => {
			const cacheDir = path.join(tmp, "cache");
			seedCache(cacheDir, corrupt());
			await expect(
				ensureBrand({
					pin: pinFor(goodZip),
					cacheDir,
					mode: "offline",
					fetchBytes: neverFetch,
				}),
			).rejects.toThrow(/sha256 mismatch/);
			expect(fs.existsSync(path.join(cacheDir, "unpacked"))).toBe(false);
		});

		test("corrupt cache + unreachable network fails", async () => {
			const cacheDir = path.join(tmp, "cache");
			seedCache(cacheDir, corrupt());
			await expect(
				ensureBrand({ pin: pinFor(goodZip), cacheDir, fetchBytes: neverFetch }),
			).rejects.toThrow(BrandError);
		});

		test("corrupt cache + a source that serves the same corrupt bytes fails", async () => {
			const cacheDir = path.join(tmp, "cache");
			seedCache(cacheDir, corrupt());
			await expect(
				ensureBrand({
					pin: pinFor(goodZip),
					cacheDir,
					fetchBytes: async () => corrupt(),
				}),
			).rejects.toThrow(/sha256 mismatch/);
		});

		test("corrupt cache is discarded and healed only by bytes that match the pin", async () => {
			const cacheDir = path.join(tmp, "cache");
			seedCache(cacheDir, corrupt());
			const logs: string[] = [];
			const result = await ensureBrand({
				pin: pinFor(goodZip),
				cacheDir,
				fetchBytes: async () => goodZip,
				log: (line) => logs.push(line),
			});
			expect(result.downloaded).toBe(true);
			expect(logs.some((line) => line.includes("does not match the pin"))).toBe(
				true,
			);
			expect(
				fs.readFileSync(path.join(cacheDir, ZIP_FILE_NAME)).equals(goodZip),
			).toBe(true);
		});
	});
});

describe("extractZip", () => {
	const extract = (entries: ZipFixtureEntry[]) =>
		extractZip(buildZip(entries), path.join(tmp, "out"));

	test("reads stored and deflated entries byte for byte", () => {
		extract(BRAND_FIXTURE_ENTRIES);
		const out = path.join(tmp, "out/exifcleaner-brand/assets/fonts");
		expect(fs.readFileSync(path.join(out, "OFL-Alpha.txt"), "utf8")).toBe(
			"OFL Alpha licence\n",
		);
		expect(fs.readFileSync(path.join(out, "OFL-Beta.txt"), "utf8")).toBe(
			"OFL Beta licence\n",
		);
	});

	test.each([
		["parent traversal", "../escape.txt"],
		["nested traversal", "exifcleaner-brand/../../escape.txt"],
		["absolute path", "/etc/escape.txt"],
		["windows drive path", "C:/escape.txt"],
		["backslash separator", "exifcleaner-brand\\..\\escape.txt"],
	])("rejects %s (zip-slip)", (_name, name) => {
		expect(() => extract([{ name, data: "x" }])).toThrow(/unzip failed/);
		expect(fs.existsSync(path.join(tmp, "escape.txt"))).toBe(false);
	});

	test("rejects a symlink entry", () => {
		expect(() =>
			extract([
				{ name: "exifcleaner-brand/link", data: "/etc/passwd", mode: 0o120777 },
			]),
		).toThrow(/non-regular/);
	});

	test("rejects a crc mismatch", () => {
		expect(() =>
			extract([
				{ name: "exifcleaner-brand/a.txt", data: "hello", badCrc: true },
			]),
		).toThrow(/crc mismatch/);
	});

	test("rejects truncated and empty archives", () => {
		expect(() =>
			extractZip(
				goodZip.subarray(0, goodZip.length - 30),
				path.join(tmp, "o1"),
			),
		).toThrow(/unzip failed/);
		expect(() => extractZip(Buffer.alloc(0), path.join(tmp, "o2"))).toThrow(
			/unzip failed/,
		);
	});
});

describe("shipBrand", () => {
	function unpackedBrand(): string {
		const root = path.join(tmp, "unpacked");
		extractZip(goodZip, root);
		return path.join(root, "exifcleaner-brand");
	}

	test("with an empty allowlist ships only the OFL licences", () => {
		const shipped = shipBrand({
			brandRoot: unpackedBrand(),
			allowlistText: "# nothing yet\n",
			outDir: path.join(tmp, "ship"),
		});
		expect(shipped).toEqual([
			"assets/fonts/OFL-Alpha.txt",
			"assets/fonts/OFL-Beta.txt",
		]);
	});

	test("ships allowlisted files in addition, and nothing else", () => {
		const shipped = shipBrand({
			brandRoot: unpackedBrand(),
			allowlistText: "assets/logo/mark.svg   # used by the about window\n",
			outDir: path.join(tmp, "ship"),
		});
		expect(shipped).toEqual([
			"assets/fonts/OFL-Alpha.txt",
			"assets/fonts/OFL-Beta.txt",
			"assets/logo/mark.svg",
		]);
		expect(fs.existsSync(path.join(tmp, "ship/BRAND.md"))).toBe(false);
		expect(fs.existsSync(path.join(tmp, "ship/assets/fonts/static"))).toBe(
			false,
		);
	});

	test("clears files left from a previous, larger allowlist", () => {
		const outDir = path.join(tmp, "ship");
		const brandRoot = unpackedBrand();
		shipBrand({ brandRoot, allowlistText: "assets/logo/mark.svg\n", outDir });
		const shipped = shipBrand({ brandRoot, allowlistText: "", outDir });
		expect(shipped).not.toContain("assets/logo/mark.svg");
	});

	test("an allowlisted file missing from the pinned brand fails the build", () => {
		expect(() =>
			shipBrand({
				brandRoot: unpackedBrand(),
				allowlistText: "assets/logo/gone.svg\n",
				outDir: path.join(tmp, "ship"),
			}),
		).toThrow(/gone\.svg/);
	});

	test("refuses to ship without any OFL licence", () => {
		const root = path.join(tmp, "nolicence");
		extractZip(
			buildZip([{ name: "exifcleaner-brand/BRAND.md", data: "x" }]),
			root,
		);
		expect(() =>
			shipBrand({
				brandRoot: path.join(root, "exifcleaner-brand"),
				allowlistText: "",
				outDir: path.join(tmp, "ship"),
			}),
		).toThrow(/licenses/);
	});

	test.each(["../x", "/abs", "a\\b", "a/../b"])(
		"allowlist rejects unsafe path %s",
		(line) => {
			expect(() => parseAllowlist(line)).toThrow(BrandError);
		},
	);
});

describe("brand:update (pin rewrite)", () => {
	function updateRoot(): { root: string; pinPath: string; cacheDir: string } {
		const root = path.join(tmp, "app");
		fs.mkdirSync(root, { recursive: true });
		const pinPath = path.join(root, "brand.pin.json");
		fs.writeFileSync(pinPath, serializePin(pinFor(goodZip, COMMIT)));
		return { root, pinPath, cacheDir: path.join(root, ".brand-cache") };
	}

	test("rewrites the pin for an explicit commit with the downloaded size and sha256, and seeds the cache", async () => {
		const { root, pinPath, cacheDir } = updateRoot();
		const next = buildZip([
			...BRAND_FIXTURE_ENTRIES,
			{ name: "exifcleaner-brand/NEW.md", data: "new" },
		]);
		const requested: string[] = [];
		await runBrandUpdate({
			argv: [NEXT_COMMIT],
			env: { BRAND_PIN_FILE: pinPath, BRAND_CACHE_DIR: cacheDir },
			root,
			log: () => {},
			fetchBytes: async (url) => {
				requested.push(url);
				return next;
			},
		});
		expect(requested).toEqual([pinUrl(BRAND_REPO, NEXT_COMMIT)]);
		const pin = readPin(pinPath);
		expect(pin).toEqual(pinFor(next, NEXT_COMMIT));
		expect(
			fs.readFileSync(path.join(cacheDir, ZIP_FILE_NAME)).equals(next),
		).toBe(true);
		// The next build is a cache hit with no network.
		const result = await ensureBrand({
			pin,
			cacheDir,
			mode: "offline",
			fetchBytes: neverFetch,
		});
		expect(result.downloaded).toBe(false);
	});

	test("defaults to the latest main commit of the brand repo", async () => {
		const { root, pinPath, cacheDir } = updateRoot();
		const calls: string[] = [];
		await runBrandUpdate({
			argv: [],
			env: { BRAND_PIN_FILE: pinPath, BRAND_CACHE_DIR: cacheDir },
			root,
			log: () => {},
			fetchBytes: async (url) => {
				calls.push(url);
				return url.startsWith("https://api.github.com/")
					? Buffer.from(`${NEXT_COMMIT}\n`)
					: goodZip;
			},
		});
		expect(calls[0]).toBe(
			`https://api.github.com/repos/${BRAND_REPO}/commits/main`,
		);
		expect(readPin(pinPath).commit).toBe(NEXT_COMMIT);
	});

	test("a failed update leaves the existing pin untouched", async () => {
		const { root, pinPath, cacheDir } = updateRoot();
		const before = fs.readFileSync(pinPath, "utf8");
		await expect(
			runBrandUpdate({
				argv: [NEXT_COMMIT],
				env: { BRAND_PIN_FILE: pinPath, BRAND_CACHE_DIR: cacheDir },
				root,
				log: () => {},
				fetchBytes: async () =>
					Buffer.from("not a zip, just long enough to scan"),
			}),
		).rejects.toThrow(/unzip failed/);
		expect(fs.readFileSync(pinPath, "utf8")).toBe(before);
	});

	test("rejects a short commit and an unresolvable latest commit", async () => {
		await expect(
			computePin({ commit: "abc123", fetchBytes: neverFetch }),
		).rejects.toThrow(/40-character/);
		await expect(
			resolveLatestCommit({
				fetchBytes: async () => Buffer.from("<html>rate limited</html>"),
			}),
		).rejects.toThrow(/could not resolve/);
	});
});

describe("brand_fetch CLI", () => {
	const script = path.join(repoRoot, "scripts/brand_fetch.mjs");

	function runCli(env: Record<string, string>) {
		return spawnSync(process.execPath, [script], {
			cwd: tmp,
			encoding: "utf8",
			env: { PATH: process.env["PATH"] ?? "", ...env },
		});
	}

	function fixtureEnv(cacheBytes: Buffer | undefined, mode: string) {
		const pinPath = path.join(tmp, "brand.pin.json");
		fs.writeFileSync(pinPath, serializePin(pinFor(goodZip)));
		const cacheDir = path.join(tmp, "cache");
		if (cacheBytes !== undefined) seedCache(cacheDir, cacheBytes);
		return {
			BRAND_PIN_FILE: pinPath,
			BRAND_CACHE_DIR: cacheDir,
			BRAND_FETCH: mode,
		};
	}

	test("offline with a matching cache exits 0 and stages the licences", () => {
		const env = fixtureEnv(goodZip, "offline");
		const result = runCli(env);
		expect(result.status, result.stderr).toBe(0);
		expect(
			fs.readdirSync(path.join(tmp, "cache/ship/assets/fonts")).sort(),
		).toEqual(["OFL-Alpha.txt", "OFL-Beta.txt"]);
	});

	test("NEGATIVE CONTROL: a corrupted cache makes the build step exit non-zero and stage nothing", () => {
		const flipped = Buffer.from(goodZip);
		flipped[60] = (flipped[60] ?? 0) ^ 0xff;
		const result = runCli(fixtureEnv(flipped, "offline"));
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/sha256 mismatch/);
		expect(fs.existsSync(path.join(tmp, "cache/ship"))).toBe(false);
	});

	test("offline with no cache exits non-zero", () => {
		const result = runCli(fixtureEnv(undefined, "offline"));
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/no cached brand zip/);
	});

	test("BRAND_FETCH=skip does nothing and logs that it did nothing", async () => {
		const logs: string[] = [];
		const outcome = await runBrandFetch({
			env: { BRAND_FETCH: "skip" },
			root: repoRoot,
			log: (line) => logs.push(line),
		});
		expect(outcome.skipped).toBe(true);
		expect(logs.join("\n")).toMatch(/not fetching/);
	});

	test("an unknown BRAND_FETCH mode is an error, not a silent default", async () => {
		await expect(
			runBrandFetch({
				env: { BRAND_FETCH: "yolo" },
				root: repoRoot,
				log: () => {},
			}),
		).rejects.toThrow(/BRAND_FETCH must be/);
	});
});
