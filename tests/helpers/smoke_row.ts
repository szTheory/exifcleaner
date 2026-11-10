import type {
	RemoveMetadataEvidence,
	RemoveMetadataResult,
} from "../../src/common/ipc_channels";

// One smoke row asserts what the installed app reported for one removal: the engine that wrote the
// file, the effective output mode and the leak-check outcome (SMK-01, D-17, D-18). Rows are printed
// as `SMOKE-ROW <file> engine=<e> mode=<m> leak=<l>` into the public CI log, so the file argument
// is a fixture row name, never a path.

export function formatSmokeRow(
	file: string,
	evidence: RemoveMetadataEvidence,
): string {
	if (/[\\/]/u.test(file)) {
		throw new Error(
			`formatSmokeRow: file must be a row name, not a path (path separator in the argument)`,
		);
	}
	if (/\s/u.test(file)) {
		throw new Error(
			`formatSmokeRow: file must not contain whitespace (a log line is one record)`,
		);
	}
	return `SMOKE-ROW ${file} engine=${evidence.engine} mode=${evidence.outputMode} leak=${evidence.leakCheck}`;
}

function mismatch({
	file,
	field,
	actual,
	expected,
}: {
	file: string;
	field: keyof RemoveMetadataEvidence;
	actual: string;
	expected: string;
}): Error {
	return new Error(
		`smoke row ${file}: ${field} was ${actual}, expected ${expected}`,
	);
}

export function assertSmokeRow({
	file,
	result,
	expected,
}: {
	file: string;
	result: RemoveMetadataResult;
	expected: RemoveMetadataEvidence;
}): RemoveMetadataEvidence {
	if (!result.success) {
		throw new Error(`smoke row ${file}: success was false, expected true`);
	}
	const evidence = result.evidence;
	if (evidence === undefined) {
		throw new Error(
			`smoke row ${file}: the result carries no evidence, expected ${expected.engine}/${expected.outputMode}/${expected.leakCheck}`,
		);
	}
	if (evidence.engine !== expected.engine) {
		throw mismatch({
			file,
			field: "engine",
			actual: evidence.engine,
			expected: expected.engine,
		});
	}
	if (evidence.outputMode !== expected.outputMode) {
		throw mismatch({
			file,
			field: "outputMode",
			actual: evidence.outputMode,
			expected: expected.outputMode,
		});
	}
	if (evidence.leakCheck !== expected.leakCheck) {
		throw mismatch({
			file,
			field: "leakCheck",
			actual: evidence.leakCheck,
			expected: expected.leakCheck,
		});
	}
	return evidence;
}
