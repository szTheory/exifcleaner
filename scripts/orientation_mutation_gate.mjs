import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ORIENTATION_SEAM =
	'if (preserveOrientation) preserveTags.push("-Orientation");';
const TARGET_SOURCE = "src/application/commands/strip_metadata_command.ts";
const TEST_TITLE = "preserves orientation metadata when toggle is enabled";

export function applyOrientationMutation(source) {
	const occurrences = source.split(ORIENTATION_SEAM).length - 1;
	if (occurrences !== 1) {
		throw new Error(
			`expected exactly one Orientation copy-back seam, found ${occurrences}`,
		);
	}
	return source.replace(ORIENTATION_SEAM, "");
}

function requireSuccess(result, label) {
	if (result.status !== 0) {
		throw new Error(
			`${label} failed (exit ${result.status})\n${result.output}`,
		);
	}
}

/**
 * @param {{
 *   readSource: () => string,
 *   writeSource: (source: string) => void,
 *   run: (step: "compile" | "orientation-test") => Promise<{status: number | null, output: string}>
 * }} dependencies
 */
export async function executeOrientationMutation({
	readSource,
	writeSource,
	run,
}) {
	const original = readSource();
	const mutated = applyOrientationMutation(original);
	let mutationError;

	writeSource(mutated);
	try {
		const mutatedCompile = await run("compile");
		requireSuccess(mutatedCompile, "mutated compile");

		const red = await run("orientation-test");
		if (red.status === 0) {
			throw new Error(
				`expected the controlled mutation to fail, but it passed\n${red.output}`,
			);
		}
		if (
			!red.output.includes("Rotate 90 CW") ||
			!red.output.includes("undefined")
		) {
			throw new Error(
				`controlled mutation failed for the wrong reason\n${red.output}`,
			);
		}
	} catch (error) {
		mutationError = error;
	} finally {
		writeSource(original);
	}

	if (readSource() !== original) {
		throw new Error("failed to restore the target source byte-for-byte");
	}
	if (mutationError !== undefined) {
		throw mutationError;
	}

	const restoredCompile = await run("compile");
	requireSuccess(restoredCompile, "restored compile");
	const green = await run("orientation-test");
	requireSuccess(green, "restored orientation test");
}

function runCommand(step) {
	const args =
		step === "compile"
			? ["compile"]
			: [
					"test:e2e",
					"tests/e2e/settings.spec.ts",
					"--grep",
					TEST_TITLE,
					"--reporter=list",
				];
	const result = spawnSync("yarn", args, {
		cwd: process.cwd(),
		encoding: "utf8",
		env: process.env,
		maxBuffer: 50 * 1024 * 1024,
	});
	return Promise.resolve({
		status: result.status,
		output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
	});
}

async function main() {
	const target = path.join(process.cwd(), TARGET_SOURCE);
	try {
		await executeOrientationMutation({
			readSource: () => fs.readFileSync(target, "utf8"),
			writeSource: (source) => fs.writeFileSync(target, source),
			run: runCommand,
		});
		console.log(
			"✓ Orientation mutation gate: exact seam RED, source restored byte-for-byte, GREEN",
		);
	} catch (error) {
		console.error(
			`✗ ORIENTATION MUTATION GATE FAILED\n${error instanceof Error ? error.message : String(error)}`,
		);
		process.exitCode = 1;
	}
}

const invokedPath = process.argv[1];
if (
	invokedPath !== undefined &&
	fileURLToPath(import.meta.url) === path.resolve(invokedPath)
) {
	await main();
}
