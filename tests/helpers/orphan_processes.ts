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
