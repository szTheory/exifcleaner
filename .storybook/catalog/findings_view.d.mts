export interface FindingsViewEntry {
	fingerprint: string;
	kind: string;
	story: string;
	rule: string;
	reason: string;
	disposition: string;
	severity?: string | undefined;
}

export interface FindingsViewVerdict {
	fingerprint: string;
	verdict: string;
	reason: string;
	decidedAt: string;
	decidedBy: string;
	reply: string;
}

export interface FindingsViewCopyEntry {
	fingerprint: string;
	disposition: string;
}

// The two documents are parsed JSON; only the fields the view prints are typed here.
export function renderFindings(inputs: {
	baseline: {
		entries?: ReadonlyArray<FindingsViewEntry> | undefined;
		verdicts?: ReadonlyArray<FindingsViewVerdict> | undefined;
	};
	copyFindings: {
		entries?: ReadonlyArray<FindingsViewCopyEntry> | undefined;
	};
}): string;
