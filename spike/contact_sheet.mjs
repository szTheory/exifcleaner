// PLN-01 spike (76-01): the non-gating "before" contact sheet (D-20).
// Reads spike-out/manifest.json, writes spike-out/contact-sheet.html (a grid of every
// captured image with story id, theme and width captions) and screenshots it with the
// Playwright chromium that is already installed (no ImageMagick, no new dependency) into
// spike-out/contact-sheet.png. The sheet is a CI artifact for the maintainer's Phase 80
// approval and is never committed.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const OUT = path.resolve(process.argv[2] ?? "spike-out");
const rows = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8"));
if (!Array.isArray(rows) || rows.length === 0) {
	throw new Error("manifest.json has no rows");
}

function escapeHtml(text) {
	return String(text)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

// 580 px frames first, then 960 px; story id then theme inside each group.
const sorted = [...rows].sort(
	(a, b) =>
		a.width - b.width ||
		String(a.story).localeCompare(String(b.story)) ||
		String(a.theme).localeCompare(String(b.theme)),
);

const first = sorted[0];
const cells = sorted
	.map((row) => {
		if (!fs.existsSync(path.join(OUT, row.file))) {
			throw new Error(`manifest names ${row.file} but the file is missing`);
		}
		const shown = row.width === 960 ? 450 : 270;
		return `<figure style="width:${shown}px"><img src="${escapeHtml(row.file)}" style="width:${shown}px;border:1px solid #888" alt="">
<figcaption><b>${escapeHtml(row.story)}</b><br>${escapeHtml(row.theme)} / ${escapeHtml(row.width)} px<br><code>${escapeHtml(String(row.sha256).slice(0, 12))}</code></figcaption></figure>`;
	})
	.join("\n");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>PLN-01 before sheet</title>
<style>
body{font:13px/1.35 sans-serif;margin:16px;background:#fff;color:#111}
h1{font-size:16px;margin:0 0 4px}
p{margin:0 0 12px;color:#444}
main{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}
figure{margin:0}
figcaption{margin-top:4px}
code{font-family:monospace}
</style></head><body>
<h1>PLN-01 before sheet: ${rows.length} images</h1>
<p>commit ${escapeHtml(first.commit)} | image ${escapeHtml(first.image)} | cpu ${escapeHtml(first.cpu)} | lane ${escapeHtml(first.lane)}</p>
<main>
${cells}
</main></body></html>
`;
const htmlPath = path.join(OUT, "contact-sheet.html");
fs.writeFileSync(htmlPath, html);

const browser = await chromium.launch();
try {
	const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
	await page.goto(pathToFileURL(htmlPath).href);
	await page.waitForFunction(() =>
		Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0),
	);
	await page.screenshot({ path: path.join(OUT, "contact-sheet.png"), fullPage: true });
} finally {
	await browser.close();
}
console.log(`contact sheet: ${rows.length} images -> ${path.join(OUT, "contact-sheet.png")}`);
