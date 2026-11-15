// PLN-01 spike (76-01): cross-run determinism matrix (S3).
//
//   node spike/compare.mjs --out <result.json> <label>=<dir> <label>=<dir> ...
//
// Each <dir> is a downloaded `spike-capture-<lane>` artifact (PNGs, manifest.json, env.txt).
// The artifact bytes are untrusted input: every PNG is re-hashed here and must equal the
// manifest's sha256 before it counts, and the bytes are only ever decoded by Chromium's image
// decoder. Prints the sha256 equality matrix over the 24 images x N captures, and for every
// non-identical image computes the pixel-diff ratio of each differing pair by drawing both
// PNGs into a canvas in the Playwright chromium already installed (no ImageMagick).
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const args = process.argv.slice(2);
let outFile = null;
const captures = [];
for (let i = 0; i < args.length; i += 1) {
	if (args[i] === "--out") {
		outFile = args[i + 1];
		i += 1;
	} else {
		const [label, dir] = String(args[i]).split("=");
		if (!label || !dir) throw new Error(`bad capture argument: ${args[i]}`);
		captures.push({ label, dir: path.resolve(dir) });
	}
}
if (captures.length < 2) throw new Error("need at least two label=dir captures");

function sha256(buffer) {
	return createHash("sha256").update(buffer).digest("hex");
}

// The artifact may nest the files one directory down; find manifest.json.
function findManifest(dir) {
	const direct = path.join(dir, "manifest.json");
	if (fs.existsSync(direct)) return dir;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			const nested = path.join(dir, entry.name);
			if (fs.existsSync(path.join(nested, "manifest.json"))) return nested;
		}
	}
	throw new Error(`no manifest.json under ${dir}`);
}

const loaded = captures.map(({ label, dir }) => {
	const root = findManifest(dir);
	const rows = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
	const byFile = new Map();
	for (const row of rows) {
		const bytes = fs.readFileSync(path.join(root, row.file));
		const actual = sha256(bytes);
		if (actual !== row.sha256) {
			throw new Error(`${label}: ${row.file} hashes to ${actual}, manifest says ${row.sha256}`);
		}
		byFile.set(row.file, { sha256: actual, bytes, row });
	}
	const cpus = [...new Set(rows.map((row) => row.cpu))];
	const images = [...new Set(rows.map((row) => row.image))];
	const commits = [...new Set(rows.map((row) => row.commit))];
	const env = fs.existsSync(path.join(root, "env.txt"))
		? fs.readFileSync(path.join(root, "env.txt"), "utf8")
		: "";
	return { label, root, byFile, cpus, images, commits, env, count: rows.length };
});

const files = [...loaded[0].byFile.keys()].sort();
for (const capture of loaded) {
	const names = [...capture.byFile.keys()].sort();
	if (JSON.stringify(names) !== JSON.stringify(files)) {
		throw new Error(`${capture.label} holds a different image set than ${loaded[0].label}`);
	}
}

// ---- pixel diff in the browser ---------------------------------------------------------
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<!doctype html><title>diff</title>");
async function pixelDiff(aBytes, bBytes) {
	return page.evaluate(
		async ({ a64, b64, threshold }) => {
			async function decode(base64) {
				const image = new Image();
				image.src = `data:image/png;base64,${base64}`;
				await image.decode();
				const canvas = document.createElement("canvas");
				canvas.width = image.naturalWidth;
				canvas.height = image.naturalHeight;
				const context = canvas.getContext("2d", { willReadFrequently: true });
				context.drawImage(image, 0, 0);
				return context.getImageData(0, 0, canvas.width, canvas.height);
			}
			const [a, b] = await Promise.all([decode(a64), decode(b64)]);
			if (a.width !== b.width || a.height !== b.height) {
				return { sameSize: false, exactPixels: -1, exactRatio: 1, vitestPixels: -1, vitestRatio: 1, size: `${a.width}x${a.height} vs ${b.width}x${b.height}` };
			}
			const maxDelta = 35215 * threshold * threshold;
			let exact = 0;
			let vitest = 0;
			for (let i = 0; i < a.data.length; i += 4) {
				if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) {
					exact += 1;
					const dr = a.data[i] - b.data[i];
					const dg = a.data[i + 1] - b.data[i + 1];
					const db = a.data[i + 2] - b.data[i + 2];
					const y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;
					const iq = dr * 0.59597799 - dg * 0.2741761 - db * 0.32180189;
					const q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;
					if (0.5053 * y * y + 0.299 * iq * iq + 0.1957 * q * q > maxDelta) vitest += 1;
				}
			}
			const total = a.width * a.height;
			return { sameSize: true, exactPixels: exact, exactRatio: exact / total, vitestPixels: vitest, vitestRatio: vitest / total, size: `${a.width}x${a.height}` };
		},
		{ a64: aBytes.toString("base64"), b64: bBytes.toString("base64"), threshold: 0.1 },
	);
}

// ---- the matrix ------------------------------------------------------------------------
const matrix = [];
let identicalCount = 0;
let maxExact = 0;
let maxVitest = 0;
for (const file of files) {
	const shas = loaded.map((capture) => capture.byFile.get(file).sha256);
	const identical = shas.every((sha) => sha === shas[0]);
	if (identical) identicalCount += 1;
	const pairs = [];
	if (!identical) {
		for (let i = 0; i < loaded.length; i += 1) {
			for (let j = i + 1; j < loaded.length; j += 1) {
				if (shas[i] === shas[j]) continue;
				const diff = await pixelDiff(
					loaded[i].byFile.get(file).bytes,
					loaded[j].byFile.get(file).bytes,
				);
				pairs.push({ a: loaded[i].label, b: loaded[j].label, ...diff });
				maxExact = Math.max(maxExact, diff.exactRatio);
				maxVitest = Math.max(maxVitest, diff.vitestRatio);
			}
		}
	}
	matrix.push({ file, identical, shas: Object.fromEntries(loaded.map((c, i) => [c.label, shas[i]])), pairs });
}
await browser.close();

const result = {
	images: files.length,
	captures: loaded.map((c) => ({ label: c.label, count: c.count, cpus: c.cpus, images: c.images, commits: c.commits })),
	cpu_models_match: new Set(loaded.flatMap((c) => c.cpus)).size === 1,
	all_identical: identicalCount === files.length,
	identical_images: identicalCount,
	max_exact_ratio: maxExact,
	max_vitest_ratio: maxVitest,
	matrix,
};

console.log(`images: ${files.length}, captures: ${loaded.map((c) => c.label).join(", ")}`);
console.log(`cpu models: ${loaded.map((c) => `${c.label}=${c.cpus.join("|")}`).join("; ")}`);
console.log(`cpu models match: ${result.cpu_models_match}`);
for (const row of matrix) {
	console.log(`${row.identical ? "SAME" : "DIFF"}  ${row.file}  ${loaded.map((c) => row.shas[c.label].slice(0, 10)).join(" ")}`);
	for (const pair of row.pairs) {
		console.log(`      ${pair.a} vs ${pair.b}: exact ${pair.exactPixels} px (${pair.exactRatio}), vitest-rule ${pair.vitestPixels} px (${pair.vitestRatio}), ${pair.size}`);
	}
}
console.log(`identical images: ${identicalCount}/${files.length}`);
console.log(`max cross-capture ratio: exact ${maxExact}, vitest-rule ${maxVitest}`);
if (outFile) fs.writeFileSync(outFile, `${JSON.stringify(result, null, "\t")}\n`);
