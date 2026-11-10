import fs from "node:fs";
import type { OutputTransactionDependencies } from "../../src/main/output_transaction";
import {
	statSourceIdentity,
	syncFileToDisk,
} from "../../src/main/source_identity";

type FileDependencies = Pick<
	OutputTransactionDependencies,
	"unlink" | "rename" | "statSource" | "syncFile" | "chown" | "chmod" | "delay"
>;

// The file-system half of OutputTransactionDependencies, wired exactly as container.ts
// wires it (the same statSourceIdentity and syncFileToDisk), so integration tests exercise
// the production identity recheck and fsync. Spread it next to the engine doubles.
export function realTransactionFileDependencies(): FileDependencies {
	return {
		unlink: fs.promises.unlink,
		rename: fs.promises.rename,
		statSource: statSourceIdentity,
		syncFile: syncFileToDisk,
		chown: fs.promises.chown,
		chmod: fs.promises.chmod,
		delay: async (milliseconds) => {
			await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
		},
	};
}

// For handler-level tests that never reach the filesystem: a constant identity (so a commit
// would pass the recheck) and no-op sync, chown and chmod.
export function fakeTransactionFileDependencies(): FileDependencies {
	return {
		unlink: async () => undefined,
		rename: async () => undefined,
		statSource: async () => ({
			dev: 1n,
			ino: 1n,
			size: 1n,
			mtimeNs: 1n,
			mode: 0o644,
			uid: 0,
			gid: 0,
		}),
		syncFile: async () => undefined,
		chown: async () => undefined,
		chmod: async () => undefined,
		delay: async () => undefined,
	};
}
