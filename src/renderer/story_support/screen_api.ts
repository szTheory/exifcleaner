// window.api answers for the real-App screen stories (Phase 73, D-08, STY-04).
//
// The preview mock refuses every data-bearing call (`mockApi.<name> not configured`), so a
// story that renders the real App needs the four calls the intake path makes. `screenApi`
// builds them from the shared outcome fixtures, so the real `processFileEntries`
// (src/renderer/hooks/use_process_files.ts) runs over fixture answers and a screen can only
// show a state the pipeline produces. The result is a plain overrides object a story drops
// into `parameters.mockApi.overrides`; it holds no module state and reads no clock.
//
// Answers are keyed by PATH, never by entry id: the App builds its entries with
// `crypto.randomUUID()` (DropZone.tsx), so the path is the only stable key. The BEFORE read
// answers the source path with the case's own metadata and the AFTER read answers the
// output path the case reports (use_process_files.ts reads `removeResult.outputPath`).
// The fixtures write "the source file itself" as the fixture source path; against a screen
// path that would read as a copy, so such an output is answered with the screen file's own
// path (the same correction 73-02 made for FileTable rows, F-04).
//
// Test support in the production source tree (V3): only *.stories.tsx files and
// story_support itself import it (.storybook/story_support_imports.test.ts), so it never
// reaches a bundle.
import type { RemoveMetadataResult } from "../../common/ipc_channels";
import type { ExifApi, FilesApi, FolderApi } from "../../preload/api_types";
import type { OutcomeCase } from "./process_outcomes";
import { fileEntry } from "./process_outcomes";

export type ScreenFile = {
	// Every path carries a supported extension: DropZone drops unsupported files.
	path: string;
	size: number;
	fixtureCase: OutcomeCase;
};

// What the fixtures call the source file; an output equal to it means "written in place".
const FIXTURE_SOURCE_PATH = fileEntry().path;

function answerFor(file: ScreenFile): RemoveMetadataResult {
	const { removeResult } = file.fixtureCase;
	if (removeResult.success && removeResult.outputPath === FIXTURE_SOURCE_PATH) {
		return { ...removeResult, outputPath: file.path };
	}
	return removeResult;
}

export function screenApi({
	files,
	hold = [],
}: {
	files: ReadonlyArray<ScreenFile>;
	// Paths whose removeMetadata never settles: the row stays Processing, deterministically.
	// The hook is sequential, so every file after a held one stays Pending.
	hold?: ReadonlyArray<string>;
}): {
	files: Pick<FilesApi, "chooseFiles">;
	folder: Pick<FolderApi, "classify">;
	exif: Pick<ExifApi, "readMetadata" | "removeMetadata">;
} {
	const answers = new Map<string, RemoveMetadataResult>();
	const metadata = new Map<string, Record<string, unknown>>();
	for (const file of files) {
		answers.set(file.path, answerFor(file));
		metadata.set(file.path, file.fixtureCase.readMetadata);
	}
	// A second pass, so a source read always wins over an output read of the same path.
	for (const file of files) {
		const answer = answers.get(file.path);
		const { afterMetadata } = file.fixtureCase;
		if (answer?.success === true && afterMetadata !== undefined) {
			if (!metadata.has(answer.outputPath)) {
				metadata.set(answer.outputPath, afterMetadata);
			}
		}
	}

	return {
		files: {
			chooseFiles: async () => files.map(({ path }) => path),
		},
		folder: {
			classify: async () => ({
				files: files.map(({ path, size }) => ({ path, size })),
				folders: [],
			}),
		},
		exif: {
			readMetadata: async (filePath) => {
				const found = metadata.get(filePath);
				if (found === undefined) {
					throw new Error(`screenApi: no metadata for ${filePath}`);
				}
				return found;
			},
			removeMetadata: (filePath) => {
				if (hold.includes(filePath)) {
					return new Promise<RemoveMetadataResult>(() => undefined);
				}
				const answer = answers.get(filePath);
				if (answer === undefined) {
					return Promise.reject(
						new Error(`screenApi: no fixture case for ${filePath}`),
					);
				}
				return Promise.resolve(answer);
			},
		},
	};
}
