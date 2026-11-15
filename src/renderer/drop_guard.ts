// Chromium's default for a file dropped onto a page is to navigate to it. The DropZone
// handles drops inside the app content, but the status bar and settings drawer sit outside
// it. Cancelling the default for the whole document means a drop anywhere else is ignored
// instead of replacing the app with the dropped file. Main-process navigation hardening
// blocks such navigations too; this keeps the renderer from requesting them at all.
interface DropGuardTarget {
	addEventListener(type: string, listener: (event: Event) => void): void;
}

export function installDocumentDropGuard(target: DropGuardTarget): void {
	const cancel = (event: Event): void => {
		event.preventDefault();
	};
	target.addEventListener("dragover", cancel);
	target.addEventListener("drop", cancel);
}
