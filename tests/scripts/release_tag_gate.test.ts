import { describe, expect, test } from "vitest";
import {
	buildTagEvidence,
	classifyTagRef,
	parseRemoteTags,
	verifyCleanupTargets,
} from "../../scripts/release_tag_gate.mjs";

const V40_TARGET = "0d625e9a84b9697844fe2ef139e4105a192a1179";
const V41_TARGET = "0a9af3179730ba735a405ba41cf57fecf7923743";

describe("release tag gate", () => {
	test.each(["refs/tags/v4.0", "refs/tags/v12.34"])(
		"rejects the two-part public tag %s",
		(ref) => {
			const result = classifyTagRef(ref);

			expect(result.ok).toBe(false);
			expect(result.reason).toContain(ref);
		},
	);

	test.each([
		"refs/tags/v4.0.0",
		"refs/tags/v3.3.0-alpha.1",
		"refs/tags/milestone-4.0",
		"refs/tags/v4.0-beta",
	])("accepts valid or non-public tag %s", (ref) => {
		expect(classifyTagRef(ref)).toEqual({ ok: true });
	});

	test("requires the locked peeled commit targets", () => {
		expect(
			verifyCleanupTargets({ v4_0: V40_TARGET, v4_1: V41_TARGET }),
		).toEqual({ v4_0: V40_TARGET, v4_1: V41_TARGET });

		expect(() =>
			verifyCleanupTargets({ v4_0: "f".repeat(40), v4_1: V41_TARGET }),
		).toThrow("v4.0");
	});

	test("rejects a tag object when no peeled commit target was resolved", () => {
		expect(() =>
			verifyCleanupTargets({
				v4_0: { object: "1e8ea1c3112fc90794777ba1fadda79832ee0dd9" },
				v4_1: { peeled: V41_TARGET },
			}),
		).toThrow("peeled");
	});

	test("parses remote tag objects separately from peeled targets", () => {
		const parsed = parseRemoteTags(
			[
				"1e8ea1c3112fc90794777ba1fadda79832ee0dd9\trefs/tags/v4.0",
				`${V40_TARGET}\trefs/tags/v4.0^{}`,
			].join("\n"),
		);

		expect(parsed.v4_0).toEqual({
			object: "1e8ea1c3112fc90794777ba1fadda79832ee0dd9",
			peeled: V40_TARGET,
		});
	});

	test("builds immutable evidence with explicit absent remote refs", () => {
		const evidence = buildTagEvidence({
			capturedAt: "2026-07-31T12:00:00.000Z",
			repository: "github:szTheory/exifcleaner",
			origin: "https://github.com/szTheory/exifcleaner.git",
			localRefs: {
				v4_0: {
					object: "1e8ea1c3112fc90794777ba1fadda79832ee0dd9",
					peeled: V40_TARGET,
				},
				v4_1: {
					object: "888f3770a3e9af6c9b7ce628b5b7b700f6ba40dc",
					peeled: V41_TARGET,
				},
			},
			remoteTags: {},
		});

		expect(evidence.refs.v4_0.peeled).toBe(V40_TARGET);
		expect(evidence.refs.v4_1.peeled).toBe(V41_TARGET);
		expect(evidence.refs.v4_0.remote.status).toBe("absent");
		expect(evidence.refs.v4_1.remote.status).toBe("absent");
	});
});
