// 69-11 (OVR-03, D-14, D-15, D-16): observation and routing helpers for the legacy-versus-staged
// overwrite differential. The legacy route is today's behaviour (ExifTool -overwrite_original);
// the two staged routes run the SAME OutputTransaction with a commitPath equal to the source,
// once with the native engine (HybridMetadataEngine) and once with ExifTool as the stage writer.
// Nothing here is a model of ExifTool: every observation is read back from the real files.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import { StripMetadataCommand } from "../../src/application/commands/strip_metadata_command";
import { VerifyGeneratedOutputQuery } from "../../src/application/queries/verify_generated_output_query";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import type { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { HybridMetadataEngine } from "../../src/infrastructure/metadata/hybrid_metadata_engine";
import { NativeMetadataAdapter } from "../../src/infrastructure/metadata/native_metadata_adapter";
import { OutputTransaction } from "../../src/main/output_transaction";
import { realTransactionFileDependencies } from "./transaction_deps";

export type RouteName = "legacy" | "staged-native" | "staged-exiftool";
export const ROUTE_NAMES: readonly RouteName[] = [
	"legacy",
	"staged-native",
	"staged-exiftool",
];

export type Settings = {
	readonly preserveOrientation: boolean;
	readonly preserveColorProfile: boolean;
	readonly preserveResolution: boolean;
	readonly preserveTimestamps: boolean;
};

export const PARITY_SETTINGS: Settings = {
	preserveOrientation: true,
	preserveColorProfile: false,
	preserveResolution: false,
	preserveTimestamps: false,
};

export type Observation = {
	readonly mode: string;
	readonly uid: number;
	readonly gid: number;
	readonly nlink: number;
	readonly ino: string;
	readonly xattrNames: readonly string[];
	readonly bytesSha256: string;
	readonly mtimeMs: number;
	readonly isSymlink: boolean;
};

export function sha256(file: string): string {
	return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// Modes are octal strings so a failure reads '644' against '640'.
export function observe(file: string): Observation {
	const link = fs.lstatSync(file);
	const stat = fs.statSync(file, { bigint: true });
	return {
		mode: (Number(stat.mode) & 0o7777).toString(8),
		uid: Number(stat.uid),
		gid: Number(stat.gid),
		nlink: Number(stat.nlink),
		ino: stat.ino.toString(),
		xattrNames: listXattrNames(file),
		bytesSha256: sha256(file),
		mtimeMs: Number(stat.mtimeMs),
		isSymlink: link.isSymbolicLink(),
	};
}

export const XATTR_MARKER = "exifcleaner.parity";
const MAC_XATTR_MARKER = "com.exifcleaner.parity";

function xattrToolName(): string | undefined {
	if (process.platform === "darwin") return "xattr";
	if (process.platform === "linux") return "setfattr";
	return undefined;
}

// Returns false when the platform or the filesystem has no user extended attributes (a Linux
// tmpfs without user_xattr, no setfattr binary, Windows); the caller skips and says so.
export function setMarkerXattr(file: string): boolean {
	try {
		if (process.platform === "darwin") {
			execFileSync("xattr", ["-w", MAC_XATTR_MARKER, "1", file], {
				stdio: "ignore",
			});
			return true;
		}
		if (process.platform === "linux") {
			execFileSync(
				"setfattr",
				["-n", `user.${XATTR_MARKER}`, "-v", "1", file],
				{
					stdio: "ignore",
				},
			);
			return true;
		}
	} catch {
		return false;
	}
	return false;
}

export function markerXattrName(): string {
	return process.platform === "darwin"
		? MAC_XATTR_MARKER
		: `user.${XATTR_MARKER}`;
}

function listXattrNames(file: string): string[] {
	const tool = xattrToolName();
	if (tool === undefined) return [];
	try {
		if (process.platform === "darwin") {
			return execFileSync("xattr", [file], { encoding: "utf8" })
				.split("\n")
				.filter((line) => line.length > 0)
				.sort();
		}
		const out = execFileSync("getfattr", ["-d", "--absolute-names", file], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		return out
			.split("\n")
			.map((line) => line.split("=")[0] ?? "")
			.filter((name) => name.startsWith("user."))
			.sort();
	} catch {
		return [];
	}
}

export function formatObservation(observation: Observation): string {
	const { mode, uid, gid, nlink, xattrNames, isSymlink } = observation;
	return `mode=${mode} uid=${uid} gid=${gid} nlink=${nlink} symlink=${isSymlink} xattrs=${xattrNames.length === 0 ? "none" : xattrNames.join("|")}`;
}

// Same naming as exif_handlers.generateMediaStagePath: a dot-prefixed sibling of the source in
// the same directory (so the rename is atomic and on the same filesystem).
export function stagePathFor(filePath: string): string {
	const parsed = path.parse(filePath);
	return path.join(
		path.dirname(filePath),
		`.${parsed.name}.exifcleaner-stage-${randomUUID()}${parsed.ext}`,
	);
}

export type RouteOutcome = {
	readonly ok: boolean;
	readonly detail: string;
};

export type ParityStack = {
	run(
		route: RouteName,
		source: string,
		settings?: Settings,
	): Promise<RouteOutcome>;
	/** How often each engine's writer was called since the last reset (route sanity). */
	writerCalls(): { native: number; exiftool: number };
	resetWriterCalls(): void;
};

export function buildParityStack(process_: ExiftoolProcess): ParityStack {
	const exiftool = new ExifToolAdapter({ process: process_ });
	const native = new NativeMetadataAdapter();
	const hybrid = new HybridMetadataEngine({ exiftool, native });
	const exiftoolWrite = vi.spyOn(exiftool, "sanitize");
	const nativeWrite = vi.spyOn(native, "sanitize");

	const stagedTransaction = (engine: "native" | "exiftool") => {
		const stripMetadata = new StripMetadataCommand({
			metadataEngine: engine === "native" ? hybrid : exiftool,
		});
		// Verification reopens through ExifTool either way (the hybrid inspect delegates to it).
		const verifyGeneratedOutput = new VerifyGeneratedOutputQuery({
			metadataEngine: hybrid,
		});
		return new OutputTransaction({
			stripMetadata,
			verifyGeneratedOutput,
			...realTransactionFileDependencies(),
		});
	};

	return {
		async run(route, source, settings = PARITY_SETTINGS) {
			if (route === "legacy") {
				const result = await exiftool.sanitize({
					source,
					destination: undefined,
					outputMode: "overwrite",
					...settings,
				});
				return result.ok
					? { ok: true, detail: "legacy overwrite" }
					: { ok: false, detail: JSON.stringify(result.error) };
			}
			const result = await stagedTransaction(
				route === "staged-native" ? "native" : "exiftool",
			).execute({
				filePath: source,
				generatedPath: stagePathFor(source),
				commitPath: source,
				...settings,
			});
			return result.ok
				? { ok: true, detail: "staged commit" }
				: { ok: false, detail: JSON.stringify(result.error) };
		},
		writerCalls: () => ({
			native: nativeWrite.mock.calls.length,
			exiftool: exiftoolWrite.mock.calls.length,
		}),
		resetWriterCalls: () => {
			nativeWrite.mockClear();
			exiftoolWrite.mockClear();
		},
	};
}

// Measured differences between today's -overwrite_original and a staged overwrite that are NOT
// asserted equal. Each entry is stated in the release notes (notesPhrase, case-insensitive) and
// the parity test asserts the difference explicitly. Every other observation was measured equal
// on macOS arm64 (APFS), Linux (hosted ubuntu-24.04) and Windows (hosted windows-2025); the
// entries below come from the first hosted run (69-17, run 42777303465, head f3d5843).
export type KnownDifference = {
	readonly id: string;
	readonly observation: string;
	readonly notesPhrase: string;
};
export const KNOWN_DIFFERENCES: readonly KnownDifference[] = [
	{
		id: "creation-time-windows",
		// The legacy overwrite keeps the file; the staged overwrite replaces it with a new file.
		observation:
			"MEASURE: win32 birthtime legacy=same staged=changed (run 42777303465): the legacy overwrite keeps the creation time of the file, the staged overwrite creates a new file whose creation time is new",
		notesPhrase: "on windows the file's creation time changes",
	},
];

// Limitations the 4.8.0 release notes must state (D-15). The wording is a contract: the
// cross-check test fails when a phrase is missing from RELEASE_NOTES.md at 4.8.0.
export type RequiredFact = { readonly id: string; readonly phrase: string };
export const NOTES_REQUIRED_FACTS: readonly RequiredFact[] = [
	{
		id: "overwrite-replaces-file",
		phrase: "overwrite replaces the file",
	},
	{
		id: "hard-link-keeps-old",
		phrase: "hard link keeps the old bytes and metadata",
	},
	{
		id: "xattr-acl-ads-not-carried",
		phrase:
			"extended attributes, ACLs and alternate data streams are not carried",
	},
	{
		id: "other-owner-unmeasured",
		phrase: "owned by a different user",
	},
];

function normalizeNotes(text: string): string {
	return text.toLowerCase().replace(/\s+/g, " ");
}

// The phrases (ids) of the required facts and known differences that a notes text does not
// contain. Case-insensitive and tolerant of line wrapping (whitespace runs collapse), nothing
// else: a paraphrase is a miss, because the wording is the contract.
export function missingNotesPhrases(
	notesText: string,
	{
		facts = NOTES_REQUIRED_FACTS,
		differences = KNOWN_DIFFERENCES,
	}: {
		facts?: readonly RequiredFact[];
		differences?: readonly KnownDifference[];
	} = {},
): string[] {
	const haystack = normalizeNotes(notesText);
	const wanted = [
		...facts.map((fact) => ({ id: fact.id, phrase: fact.phrase })),
		...differences.map((entry) => ({
			id: entry.id,
			phrase: entry.notesPhrase,
		})),
	];
	return wanted
		.filter(({ phrase }) => !haystack.includes(normalizeNotes(phrase)))
		.map(({ id }) => id);
}
