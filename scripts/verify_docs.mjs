import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const manifest = JSON.parse(
	await readFile(path.join(root, "docs", "manifest.json"), "utf8"),
);
const packageJson = JSON.parse(
	await readFile(path.join(root, "package.json"), "utf8"),
);
const failures = [];
const documents = [
	manifest.index,
	...manifest.documents.map((doc) => doc.path),
];
const indexText = await readText(manifest.index);

for (const document of manifest.documents) {
	if (!indexText.includes(path.relative("docs", document.path))) {
		failures.push(`${manifest.index} does not link to ${document.path}`);
	}
	const text = await readText(document.path);
	await verifyLocalLinks(document.path, text);
	for (const source of document.sources) {
		const sourceText = await readText(source.path);
		for (const symbol of source.symbols) {
			if (!sourceText.includes(symbol)) {
				failures.push(
					`${document.path} references missing symbol ${symbol} in ${source.path}`,
				);
			}
		}
	}
}

await verifyLocalLinks(manifest.index, indexText);
for (const file of manifest.versionFiles) {
	const text = await readText(file);
	if (!text.includes(`Current app version: ${packageJson.version}`)) {
		failures.push(
			`${file} must state Current app version: ${packageJson.version}`,
		);
	}
}

for (const file of documents) {
	if (!(await exists(file))) failures.push(`missing document ${file}`);
}

if (failures.length > 0) {
	throw new Error(
		`Documentation verification failed:\n- ${failures.join("\n- ")}`,
	);
}

console.log(
	`Documentation verified: ${documents.length} indexed documents, version ${packageJson.version}`,
);

async function verifyLocalLinks(documentPath, text) {
	for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
		const target = match[1].split("#")[0];
		if (!target || /^(https?:|mailto:)/.test(target)) continue;
		const resolved = path.normalize(
			path.join(path.dirname(documentPath), target),
		);
		if (!(await exists(resolved))) {
			failures.push(`${documentPath} has broken link ${match[1]}`);
		}
	}
}

async function readText(relativePath) {
	try {
		return await readFile(path.join(root, relativePath), "utf8");
	} catch {
		failures.push(`missing file ${relativePath}`);
		return "";
	}
}

async function exists(relativePath) {
	return stat(path.join(root, relativePath)).then(
		() => true,
		() => false,
	);
}
