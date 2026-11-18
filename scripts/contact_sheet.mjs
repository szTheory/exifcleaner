#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const output = path.resolve(
	process.argv[2] ??
		process.env["EXIFCLEANER_VISUAL_OUTPUT_DIR"] ??
		path.join("/tmp", "exifcleaner-visual-capture"),
);
const manifest = JSON.parse(
	fs.readFileSync(path.join(output, "manifest.json"), "utf8"),
);
if (!Array.isArray(manifest.cases) || manifest.cases.length !== 25) {
	throw new Error("contact sheet requires a verified 25-case manifest");
}

function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function safeFile(value) {
	if (
		typeof value !== "string" ||
		path.basename(value) !== value ||
		!/^[A-Za-z0-9._-]+\.png$/u.test(value) ||
		value.includes("..")
	) {
		throw new Error(`unsafe contact-sheet filename: ${String(value)}`);
	}
	const file = path.join(output, value);
	if (!fs.statSync(file).isFile()) throw new Error(`missing image: ${value}`);
	return value;
}

const rows = [...manifest.cases].sort(
	(a, b) =>
		a.width - b.width ||
		a.story.localeCompare(b.story) ||
		a.theme.localeCompare(b.theme) ||
		a.locale.localeCompare(b.locale),
);
const cells = rows
	.map((row) => {
		const file = safeFile(row.file);
		const shown = row.width === 960 ? 450 : 270;
		return `<figure style="width:${shown}px"><img src="${escapeHtml(file)}" width="${shown}" alt="" style="width:${shown}px;border:1px solid #888"><figcaption><b>${escapeHtml(row.story)}</b><br>${escapeHtml(row.theme)} / ${escapeHtml(row.locale)} / ${escapeHtml(row.width)} px<br><code>${escapeHtml(row.sha256.slice(0, 12))}</code></figcaption></figure>`;
	})
	.join("\n");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Visual review: ${rows.length} images</title>
<style>
body{font:13px/1.35 sans-serif;margin:16px;background:#fff;color:#111}
h1{font-size:16px;margin:0 0 4px}
p{margin:0 0 12px;color:#444}
main{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}
figure{margin:0}
figcaption{margin-top:4px}
code{font-family:monospace}
</style></head><body>
<h1>Visual review sheet: ${rows.length} images</h1>
<p>ref ${escapeHtml(manifest.ref)} | commit ${escapeHtml(manifest.commit)} | capture image ${escapeHtml(manifest.image)}</p>
<main>
${cells}
</main></body></html>
`;

const htmlPath = path.join(output, "contact-sheet.html");
fs.writeFileSync(htmlPath, html);
const browser = await chromium.launch();
try {
	const page = await browser.newPage({
		viewport: { width: 1500, height: 900 },
	});
	await page.goto(pathToFileURL(htmlPath).href);
	await page.waitForFunction(() =>
		Array.from(document.images).every(
			(image) => image.complete && image.naturalWidth > 0,
		),
	);
	await page.screenshot({
		path: path.join(output, "contact-sheet.png"),
		fullPage: true,
	});
} finally {
	await browser.close();
}
console.log(
	`contact sheet: ${rows.length} images -> ${path.join(output, "contact-sheet.png")}`,
);
