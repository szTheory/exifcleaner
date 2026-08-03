import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const FULL_SHA = /^[0-9a-f]{40}$/;

function assertInputs(input) {
	if (!VERSION.test(input.packageVersion)) {
		throw new Error("packageVersion must be a three-part application version");
	}
	if (!FULL_SHA.test(input.headSha)) {
		throw new Error("headSha must be a full lowercase commit SHA");
	}
	if (typeof input.tag?.exists !== "boolean") {
		throw new Error("tag.exists must be a boolean");
	}
	if (input.tag.exists && !FULL_SHA.test(input.tag.sha)) {
		throw new Error("An existing tag must resolve to a full commit SHA");
	}
	if (typeof input.release?.exists !== "boolean") {
		throw new Error("release.exists must be a boolean");
	}
	if (
		input.release.exists &&
		(typeof input.release.isDraft !== "boolean" ||
			typeof input.release.tagName !== "string")
	) {
		throw new Error("An existing release must include isDraft and tagName");
	}
}

/**
 * Classify whether a tested commit may enter the release-promotion path.
 *
 * @param {{packageVersion: string; headSha: string; tag: {exists: boolean; sha?: string}; release: {exists: boolean; isDraft?: boolean; tagName?: string}}} input
 * @returns {{action: "noop" | "promote"; tag: string; reconcileTag?: boolean}}
 */
export function classifyReleaseState(input) {
	assertInputs(input);
	const tag = `v${input.packageVersion}`;

	if (
		input.release.exists &&
		input.release.isDraft === false &&
		input.release.tagName === tag &&
		input.tag.exists
	) {
		return { action: "noop", tag };
	}
	if (!input.release.exists && !input.tag.exists) {
		return { action: "promote", tag, reconcileTag: false };
	}
	if (
		!input.release.exists &&
		input.tag.exists &&
		input.tag.sha === input.headSha
	) {
		return { action: "promote", tag, reconcileTag: false };
	}
	if (
		input.release.exists &&
		input.release.isDraft === true &&
		input.release.tagName === tag &&
		input.tag.exists
	) {
		return {
			action: "promote",
			tag,
			reconcileTag: input.tag.sha !== input.headSha,
		};
	}

	throw new Error(`Unsupported release state for ${tag}`);
}

function argumentValue(name) {
	const index = process.argv.indexOf(name);
	if (index < 0 || process.argv[index + 1] === undefined) {
		throw new Error(`Missing required argument: ${name}`);
	}
	return process.argv[index + 1];
}

export function main() {
	const result = classifyReleaseState({
		packageVersion: process.env.PACKAGE_VERSION,
		headSha: process.env.HEAD_SHA,
		tag: JSON.parse(fs.readFileSync(argumentValue("--tag-state"), "utf8")),
		release: JSON.parse(
			fs.readFileSync(argumentValue("--release-state"), "utf8"),
		),
	});

	const output = process.env.GITHUB_OUTPUT;
	if (output === undefined || output === "") {
		throw new Error("GITHUB_OUTPUT is required");
	}
	fs.appendFileSync(
		output,
		[
			`action=${result.action}`,
			`tag=${result.tag}`,
			`reconcile_tag=${result.reconcileTag === true ? "true" : "false"}`,
			"",
		].join("\n"),
	);
	console.log(JSON.stringify(result));
	return 0;
}

const isDirectRun =
	process.argv[1] !== undefined &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	try {
		process.exitCode = main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
