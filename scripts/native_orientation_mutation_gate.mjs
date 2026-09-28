import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NATIVE_ORIENTATION_SEAM =
	"preserveOrientation: request.preserveOrientation,";
const MUTATED_SEAM = "preserveOrientation: false,";
const TARGET_SOURCE = "src/infrastructure/metadata/native_metadata_adapter.ts";
const TEST_FILE = "tests/integration/native_metadata_oracle.test.ts";
const TEST_TITLE = "preserves requested orientation natively";

export function applyNativeOrientationMutation(source) {
	const occurrences = source.split(NATIVE_ORIENTATION_SEAM).length - 1;
	if (occurrences !== 1) {
		throw new Error(
			`expected exactly one native Orientation forwarding seam, found ${occurrences}`,
		);
	}
	return source.replace(NATIVE_ORIENTATION_SEAM, MUTATED_SEAM);
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
export async function executeNativeOrientationMutation({
	readSource,
	writeSource,
	run,
}) {
	const original = readSource();
	const mutated = applyNativeOrientationMutation(original);
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
			!red.output.includes("orientation.jpg") ||
			!red.output.includes("orientation.png")
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
			: ["vitest", "run", TEST_FILE, "-t", TEST_TITLE];
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
		await executeNativeOrientationMutation({
			readSource: () => fs.readFileSync(target, "utf8"),
			writeSource: (source) => fs.writeFileSync(target, source),
			run: runCommand,
		});
		console.log(
			"✓ Native orientation mutation gate: exact seam RED, source restored byte-for-byte, GREEN",
		);
	} catch (error) {
		console.error(
			`✗ NATIVE ORIENTATION MUTATION GATE FAILED\n${error instanceof Error ? error.message : String(error)}`,
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
