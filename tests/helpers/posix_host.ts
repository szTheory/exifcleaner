import { beforeAll, describe, it, type TestContext } from "vitest";

/**
 * Host preconditions that fail loudly instead of skipping (verify:known-gaps forbids
 * skipIf/runIf because a runner can silently omit product coverage with them; Phase 53 D-50
 * precedent in tests/integration/large_file_support.test.ts).
 *
 * The vitest suite runs on macOS and on the Linux CI runner as a normal user. A host without
 * POSIX permission semantics (Windows) or one that ignores them (root) cannot give these tests
 * their meaning, so the test refuses by name; it never passes without having asserted.
 */
export function assertPosixHost(): void {
	if (process.platform === "win32") {
		throw new Error(
			"POSIX host precondition failed: mode, ownership and hard-link semantics are unavailable on win32",
		);
	}
}

/** POSIX and a normal user: root ignores permission bits, so a 0444 or uid/gid case means nothing. */
export function assertPosixUserHost(): void {
	assertPosixHost();
	if (process.getuid?.() === 0) {
		throw new Error(
			"POSIX user host precondition failed: running as root, which ignores permission bits",
		);
	}
}

type SuiteBody = () => unknown;
type TestBody = (context: TestContext) => unknown;

/** `it` whose body first asserts a POSIX host. */
export function itOnPosix(
	name: string,
	body: TestBody,
	timeout?: number,
): void {
	it(
		name,
		(context) => {
			assertPosixHost();
			return body(context);
		},
		timeout,
	);
}

/** `it` whose body first asserts a POSIX host and a non-root user. */
export function itOnPosixUser(
	name: string,
	body: TestBody,
	timeout?: number,
): void {
	it(
		name,
		(context) => {
			assertPosixUserHost();
			return body(context);
		},
		timeout,
	);
}

/** `describe` whose every test fails by name on a host without POSIX semantics. */
export function describeOnPosix(name: string, suite: SuiteBody): void {
	describe(name, () => {
		beforeAll(assertPosixHost);
		suite();
	});
}

/** `describe` whose every test fails by name on a non-POSIX or root host. */
export function describeOnPosixUser(name: string, suite: SuiteBody): void {
	describe(name, () => {
		beforeAll(assertPosixUserHost);
		suite();
	});
}
