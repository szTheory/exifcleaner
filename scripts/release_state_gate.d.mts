export interface ReleaseStateInput {
	packageVersion: string;
	headSha: string;
	tag: {
		exists: boolean;
		sha?: string;
	};
	release: {
		exists: boolean;
		isDraft?: boolean;
		tagName?: string;
	};
}

export type ReleaseStateResult =
	| { action: "noop"; tag: string }
	| { action: "promote"; tag: string; reconcileTag: boolean };

export function classifyReleaseState(
	input: ReleaseStateInput,
): ReleaseStateResult;

export function main(): number;
