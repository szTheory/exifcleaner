import { useEffect, useState, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { useAppContext } from "../../contexts/AppContext";
import type { FileEntry, AppAction } from "../../contexts/AppContext";
import type { ClassifiedFile } from "../../../common/ipc_channels";
import { FileProcessingStatus, isSupportedFile } from "../../../domain";
import { getFileExtension } from "../../utils/get_file_extension";
import { useProcessFiles } from "../../hooks/use_process_files";
import { useI18n } from "../../hooks/use_i18n";
import { Toast } from "./Toast";

const FOLDER_AUTO_COLLAPSE_DELAY_MS = 1500;
const SKIP_TOAST_DELAY_MS = 3000;

function buildFileEntry(
	path: string,
	name: string,
	size: number,
	folder: string | null,
): FileEntry {
	return {
		id: crypto.randomUUID(),
		path,
		name,
		extension: getFileExtension({ filename: name }),
		size,
		folder,
		status: FileProcessingStatus.Pending,
		beforeTags: null,
		afterTags: null,
		beforeMetadata: null,
		afterMetadata: null,
		error: null,
	};
}

function computeFolderLabel(folderPath: string, filePath: string): string {
	const folderBaseName = folderPath.split(/[/\\]/).filter(Boolean).pop() || "";
	const relativePath = filePath
		.slice(folderPath.length)
		.replace(/[/\\][^/\\]+$/, "");
	return relativePath
		? `${folderBaseName}${relativePath}/`
		: `${folderBaseName}/`;
}

function buildLooseEntries(files: ClassifiedFile[]): FileEntry[] {
	return files
		.filter((f) => isSupportedFile({ filename: f.path }))
		.map((f) => {
			const name = window.api.files.basename(f.path);
			return buildFileEntry(f.path, name, f.size, null);
		});
}

/**
 * Resolve real sizes for paths that arrived without them (folder expansion, File > Open).
 *
 * classify() stats each path anyway, so this reuses the one place in the app that
 * already knows a file's size rather than adding a second way to ask. Paths that
 * vanished between listing and here are dropped by classify, which is correct — a
 * file that no longer exists should not get a row.
 */
async function classifyForSizes(paths: string[]): Promise<ClassifiedFile[]> {
	if (paths.length === 0) return [];
	const { files } = await window.api.folder.classify(paths);
	return files;
}

async function expandAndProcessFolder({
	folderPath,
	dispatch,
	processFiles,
	onSkipToast,
	unsupportedSkippedTemplate,
}: {
	folderPath: string;
	dispatch: (action: AppAction) => void;
	processFiles: (files: FileEntry[]) => void;
	onSkipToast?: ((message: string) => void) | undefined;
	unsupportedSkippedTemplate: string;
}): Promise<void> {
	const folderBaseName =
		folderPath.split(/[/\\]/).filter(Boolean).pop() || folderPath;
	const folderLabel = folderBaseName + "/";

	dispatch({ type: "ADD_FOLDER_SCANNING", folder: folderLabel });

	const result = await window.api.folder.expand(folderPath);

	if (result.error !== undefined) {
		dispatch({
			type: "UPDATE_FOLDER_STATE",
			folder: folderLabel,
			status: "empty",
			fileCount: 0,
		});
		return;
	}

	const sized = await classifyForSizes(result.files);
	const folderEntries: FileEntry[] = sized.map((f) => {
		const name = window.api.files.basename(f.path);
		return buildFileEntry(
			f.path,
			name,
			f.size,
			computeFolderLabel(folderPath, f.path),
		);
	});

	if (folderEntries.length === 0) {
		dispatch({
			type: "UPDATE_FOLDER_STATE",
			folder: folderLabel,
			status: "empty",
			fileCount: 0,
		});
		setTimeout(() => {
			dispatch({ type: "COLLAPSE_FOLDER", folder: folderLabel });
		}, FOLDER_AUTO_COLLAPSE_DELAY_MS);
	} else {
		dispatch({ type: "ADD_FILES", files: folderEntries });
		dispatch({
			type: "UPDATE_FOLDER_STATE",
			folder: folderLabel,
			status: "complete",
			fileCount: folderEntries.length,
		});
		processFiles(folderEntries);
	}

	if (result.skippedCount > 0 && onSkipToast !== undefined) {
		onSkipToast(
			unsupportedSkippedTemplate.replace(
				"{count}",
				String(result.skippedCount),
			),
		);
	}
}

export function DropZone({
	children,
}: {
	children: ReactNode;
}): React.JSX.Element {
	const [isDragOver, setIsDragOver] = useState(false);
	const [saveAsCopy, setSaveAsCopy] = useState<boolean | null>(null);
	const [skipToast, setSkipToast] = useState("");
	const [skipToastVisible, setSkipToastVisible] = useState(false);
	const skipToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const { state, dispatch } = useAppContext();
	const { processFiles } = useProcessFiles();
	const { t } = useI18n();

	const showSkipToast = useCallback((message: string): void => {
		if (skipToastTimer.current !== null) clearTimeout(skipToastTimer.current);
		setSkipToast(message);
		setSkipToastVisible(true);
		skipToastTimer.current = setTimeout(() => {
			setSkipToastVisible(false);
			skipToastTimer.current = null;
		}, SKIP_TOAST_DELAY_MS);
	}, []);

	useEffect(() => {
		let active = true;
		void window.api.settings.get().then((settings) => {
			if (active) setSaveAsCopy(settings.saveAsCopy);
		});
		const unsubscribe = window.api.settings.onChanged((settings) => {
			setSaveAsCopy(settings.saveAsCopy);
		});
		return () => {
			active = false;
			unsubscribe();
			if (skipToastTimer.current !== null) clearTimeout(skipToastTimer.current);
		};
	}, []);

	const handleDragOver = (e: React.DragEvent): void => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(true);
	};

	const handleDragLeave = (e: React.DragEvent): void => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);
	};

	const processSelectedPaths = useCallback(
		async (allPaths: string[]): Promise<void> => {
			const { files: filePaths, folders: folderPaths } =
				await window.api.folder.classify(allPaths);

			// Loose files first (mixed drop ordering per D-07)
			const looseEntries = buildLooseEntries(filePaths);
			if (looseEntries.length > 0) {
				dispatch({ type: "ADD_FILES", files: looseEntries });
				processFiles(looseEntries);
			}
			const unsupportedCount = filePaths.length - looseEntries.length;
			if (unsupportedCount > 0) {
				showSkipToast(
					t("intake.unsupportedSkipped").replace(
						"{count}",
						String(unsupportedCount),
					),
				);
			}

			for (const folderPath of folderPaths) {
				await expandAndProcessFolder({
					folderPath,
					dispatch,
					processFiles,
					onSkipToast: showSkipToast,
					unsupportedSkippedTemplate: t("intake.unsupportedSkipped"),
				});
			}
		},
		[dispatch, processFiles, showSkipToast, t],
	);

	const handleDrop = useCallback(
		async (e: React.DragEvent): Promise<void> => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragOver(false);

			const allPaths = Array.from(e.dataTransfer.files).map((file) =>
				window.api.files.getPathForFile(file),
			);
			await processSelectedPaths(allPaths);
		},
		[processSelectedPaths],
	);

	// Files added via File > Open menu
	useEffect(() => {
		const cleanup = window.api.files.onFileOpenAddFiles((menuFilePaths) => {
			void (async () => {
				await processSelectedPaths(menuFilePaths);
			})();
		});
		return cleanup;
	}, [processSelectedPaths]);

	async function chooseFiles(): Promise<void> {
		await processSelectedPaths(await window.api.files.chooseFiles());
	}

	async function chooseFolder(): Promise<void> {
		const folderPath = await window.api.files.chooseFolder();
		if (folderPath !== null) await processSelectedPaths([folderPath]);
	}

	return (
		<div
			className={`drop-zone${isDragOver ? " drop-zone--active" : ""}`}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			role="region"
			aria-label={t("intake.dropZone")}
		>
			{children}
			{state.files.length === 0 && (
				<div className="drop-zone__actions">
					<button type="button" onClick={() => void chooseFiles()}>
						{t("intake.chooseFiles")}
					</button>
					<button type="button" onClick={() => void chooseFolder()}>
						{t("intake.chooseFolder")}
					</button>
					{saveAsCopy !== null && (
						<span className="drop-zone__output-mode">
							{t(saveAsCopy ? "intake.outputCopy" : "intake.outputOverwrite")}
						</span>
					)}
				</div>
			)}
			<Toast message={skipToast} visible={skipToastVisible} />
		</div>
	);
}
