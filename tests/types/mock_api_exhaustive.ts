// Type-level exhaustiveness checks for the window.api mock (D-26). This file
// is not a test: `yarn test` does not collect it, `yarn typecheck` compiles
// it. It uses `Assert<>` rather than an expect-error directive comment,
// which Prettier can strand on the wrong line.
//
// Two layers guard the mock:
//   1. `base` in tests/fakes/mock_window_api.ts must satisfy
//      `Complete<ElectronApi>`: a new surface on ElectronApi fails there.
//   2. The assertions below fail if `Complete` itself is loosened, which
//      would silently weaken layer 1.

import type { ElectronApi } from "../../src/preload/api_types";
import type { Complete } from "../fakes/mock_window_api";

type Assert<T extends true> = T;

// An optional key makes `{}` assignable to the Pick of that key.
type KeyIsRequired<T, K extends keyof T> = {} extends Pick<T, K> ? false : true;

// `true` only when every key of T is required (any optional key makes the
// union `boolean`, which does not satisfy `Assert`).
type AllKeysRequired<T> = { [K in keyof T]-?: KeyIsRequired<T, K> }[keyof T];

type CompleteApi = Complete<ElectronApi>;

// The one optional member of ElectronApi must be required on Complete.
export type OptionalMemberIsRequired = Assert<
	KeyIsRequired<CompleteApi["theme"], "onThemeModeChanged">
>;

export type EveryNamespaceIsRequired = Assert<AllKeysRequired<CompleteApi>>;

export type EveryMemberIsRequired = Assert<
	{
		[N in keyof CompleteApi]: AllKeysRequired<CompleteApi[N]>;
	}[keyof CompleteApi]
>;
