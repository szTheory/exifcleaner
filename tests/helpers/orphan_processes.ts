import { execFileSync } from "node:child_process";

export interface ProcessRow {
	pid: number;
	ppid: number;
	stat: string;
	args: string;
}

/** Parses `ps -o pid=,ppid=,stat=,args=` output: three fields, then the rest of the line as args. */
export function parsePsRows(raw: string): ProcessRow[] {
	const rows: ProcessRow[] = [];
	for (const line of raw.split("\n")) {
		const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/.exec(line);
		if (match === null) {
			continue;
		}
		const [, pid, ppid, stat, args] = match;
		if (pid === undefined || ppid === undefined || stat === undefined) {
			continue;
		}
		rows.push({
			pid: Number(pid),
			ppid: Number(ppid),
			stat,
			args: args ?? "",
		});
	}
	return rows;
}

export function listPosixProcesses(): ProcessRow[] {
	const raw = execFileSync(
		"ps",
		["-A", "-ww", "-o", "pid=,ppid=,stat=,args="],
		{ encoding: "utf8" },
	);
	return parsePsRows(raw);
}

/** A pid is gone when absent or a zombie: kill(pid, 0) still succeeds on zombies. */
export function isGoneIn({
	rows,
	pid,
}: {
	rows: ProcessRow[];
	pid: number;
}): boolean {
	const row = rows.find((candidate) => candidate.pid === pid);
	return row === undefined || row.stat.startsWith("Z");
}

export async function pollUntilGone({
	pid,
	timeoutMs,
	intervalMs,
}: {
	pid: number;
	timeoutMs: number;
	intervalMs: number;
}): Promise<{ gone: boolean; elapsedMs: number }> {
	const start = Date.now();
	for (;;) {
		if (isGoneIn({ rows: listPosixProcesses(), pid })) {
			return { gone: true, elapsedMs: Date.now() - start };
		}
		if (Date.now() - start >= timeoutMs) {
			return { gone: false, elapsedMs: Date.now() - start };
		}
		await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
	}
}

function isInScopeStayOpen({
	row,
	scopeRoots,
}: {
	row: ProcessRow;
	scopeRoots: string[];
}): boolean {
	return (
		row.args.includes("-stay_open") &&
		row.args.includes("exiftool") &&
		scopeRoots.some((root) => row.args.includes(root))
	);
}

function descendsFrom({
	rows,
	row,
	ancestorPid,
}: {
	rows: ProcessRow[];
	row: ProcessRow;
	ancestorPid: number;
}): boolean {
	let current: ProcessRow | undefined = row;
	for (let step = 0; step < 64 && current !== undefined; step++) {
		if (current.ppid === ancestorPid) {
			return true;
		}
		if (current.ppid <= 1) {
			return false;
		}
		const parentPid: number = current.ppid;
		current = rows.find((candidate) => candidate.pid === parentPid);
	}
	return false;
}

/**
 * D-08 suite-wide leftover classifier: the exiftool `-stay_open` processes a vitest run
 * created and failed to end.
 *
 * Scope: args contain `-stay_open`, `exiftool` and a scope root (the repo or the temp dir),
 * so an installed ExifCleaner or a one-shot exiftool never counts. A row is a leftover only
 * when it is not a zombie, was not present at setup, and is either parented to a reaper (init
 * or the observed subreaper: an orphan) or descends from the runner (still owned by this run).
 * A row parented to any other live process is a concurrent app or dev session and is excluded,
 * so the gate cannot flake on a developer machine.
 */
export function classifyStayOpenLeftovers({
	rows,
	scopeRoots,
	preexisting,
	runnerPid,
	reaperPids,
}: {
	rows: ProcessRow[];
	scopeRoots: string[];
	preexisting: ReadonlySet<number>;
	runnerPid: number;
	reaperPids: ReadonlySet<number>;
}): ProcessRow[] {
	return rows.filter((row) => {
		if (!isInScopeStayOpen({ row, scopeRoots })) {
			return false;
		}
		if (row.stat.startsWith("Z") || preexisting.has(row.pid)) {
			return false;
		}
		return (
			reaperPids.has(row.ppid) ||
			descendsFrom({ rows, row, ancestorPid: runnerPid })
		);
	});
}
