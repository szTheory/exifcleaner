import { describe, expect, it } from "vitest";
import {
	OutputTransaction,
	type OutputTransactionDependencies,
} from "../../src/main/output_transaction";

const originalPath = "/tmp/original.mp4";
const generatedPath = "/tmp/.original.exifcleaner-stage.mp4";

type TransactionTestOptions = {
	writeResult?: Awaited<
		ReturnType<OutputTransactionDependencies["stripMetadata"]["execute"]>
	>;
	verifyResult?: Awaited<
		ReturnType<
			OutputTransactionDependencies["verifyGeneratedOutput"]["execute"]
		>
	>;
	unlink?: OutputTransactionDependencies["unlink"];
	rename?: OutputTransactionDependencies["rename"];
};

function createTransaction({
	writeResult = { ok: true, value: { tagsRemoved: 0 } },
	verifyResult = { ok: true, value: undefined },
	unlink = async () => undefined,
	rename = async () => undefined,
}: TransactionTestOptions = {}): {
	transaction: OutputTransaction;
	events: string[];
} {
	const events: string[] = [];
	const transaction = new OutputTransaction({
		stripMetadata: {
			execute: async () => {
				events.push("write");
				return writeResult;
			},
		},
		verifyGeneratedOutput: {
			execute: async ({ generatedPath: path }) => {
				events.push(`verify:${path}`);
				return verifyResult;
			},
		},
		unlink: async (path) => {
			events.push(`unlink:${path}`);
			return unlink(path);
		},
		rename: async (from, to) => {
			events.push(`rename:${from}:${to}`);
			return rename(from, to);
		},
		delay: async (milliseconds) => {
			events.push(`delay:${milliseconds}`);
		},
	});

	return { transaction, events };
}

describe("OutputTransaction", () => {
	it("writes, verifies the exact output, then returns one publishable success", async () => {
		const { transaction, events } = createTransaction();

		const result = await transaction.execute({
			filePath: originalPath,
			generatedPath,
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveTimestamps: false,
		});

		expect(result).toEqual({ ok: true, value: { outputPath: generatedPath } });
		expect(events).toEqual(["write", `verify:${generatedPath}`]);
	});

	it("returns write-failed before verification", async () => {
		const { transaction, events } = createTransaction({
			writeResult: {
				ok: false,
				error: { code: "exiftool-error", detail: "write failed" },
			},
		});

		const result = await transaction.execute({
			filePath: originalPath,
			generatedPath,
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveTimestamps: false,
		});

		expect(result).toEqual({ ok: false, error: { code: "write-failed" } });
		expect(events).toEqual(["write"]);
	});

	it("cleans the exact generated path before reporting verification-failed", async () => {
		const { transaction, events } = createTransaction({
			verifyResult: {
				ok: false,
				error: { code: "output-verification-failed", detail: "not reopenable" },
			},
		});

		const result = await transaction.execute({
			filePath: originalPath,
			generatedPath,
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveTimestamps: false,
		});

		expect(result).toEqual({
			ok: false,
			error: { code: "verification-failed" },
		});
		expect(result).not.toHaveProperty("outputPath");
		expect(events).toEqual([
			"write",
			`verify:${generatedPath}`,
			`unlink:${generatedPath}`,
		]);
	});

	it("treats ENOENT cleanup as a successful discard", async () => {
		const enoent = Object.assign(new Error("already removed"), {
			code: "ENOENT",
		});
		const { transaction, events } = createTransaction({
			verifyResult: {
				ok: false,
				error: { code: "output-verification-failed", detail: "not reopenable" },
			},
			unlink: async () => Promise.reject(enoent),
		});

		await expect(
			transaction.execute({
				filePath: originalPath,
				generatedPath,
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveTimestamps: false,
			}),
		).resolves.toEqual({ ok: false, error: { code: "verification-failed" } });
		expect(events).toEqual([
			"write",
			`verify:${generatedPath}`,
			`unlink:${generatedPath}`,
		]);
	});

	it("reports the exact residual path after three transient cleanup failures", async () => {
		const eacces = Object.assign(new Error("locked"), { code: "EACCES" });
		const { transaction, events } = createTransaction({
			verifyResult: {
				ok: false,
				error: { code: "output-verification-failed", detail: "not reopenable" },
			},
			unlink: async () => Promise.reject(eacces),
		});

		await expect(
			transaction.execute({
				filePath: originalPath,
				generatedPath,
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveTimestamps: false,
			}),
		).resolves.toEqual({
			ok: false,
			error: { code: "cleanup-failed", residualPath: generatedPath },
		});
		expect(events).toEqual([
			"write",
			`verify:${generatedPath}`,
			`unlink:${generatedPath}`,
			"delay:20",
			`unlink:${generatedPath}`,
			"delay:50",
			`unlink:${generatedPath}`,
		]);
	});

	it("commits a verified stage only after verification", async () => {
		const { transaction, events } = createTransaction();

		const result = await transaction.execute({
			filePath: originalPath,
			generatedPath,
			commitPath: originalPath,
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveTimestamps: false,
		});

		expect(result).toEqual({ ok: true, value: { outputPath: originalPath } });
		expect(events).toEqual([
			"write",
			`verify:${generatedPath}`,
			`rename:${generatedPath}:${originalPath}`,
		]);
	});

	it("cleans a failed commit stage before publishing a terminal failure", async () => {
		const { transaction, events } = createTransaction({
			rename: async () => Promise.reject(new Error("rename failed")),
		});

		const result = await transaction.execute({
			filePath: originalPath,
			generatedPath,
			commitPath: originalPath,
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveTimestamps: false,
		});

		expect(result).toEqual({ ok: false, error: { code: "commit-failed" } });
		expect(result).not.toHaveProperty("outputPath");
		expect(events).toEqual([
			"write",
			`verify:${generatedPath}`,
			`rename:${generatedPath}:${originalPath}`,
			`unlink:${generatedPath}`,
		]);
	});
});
