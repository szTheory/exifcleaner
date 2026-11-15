import { describe, expect, it } from "vitest";
import { installDocumentDropGuard } from "../../src/renderer/drop_guard";

function fakeTarget() {
	const listeners = new Map<string, (event: Event) => void>();
	return {
		listeners,
		addEventListener(type: string, listener: (event: Event) => void) {
			listeners.set(type, listener);
		},
	};
}

function fakeEvent() {
	return {
		defaultPrevented: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
	};
}

describe("installDocumentDropGuard", () => {
	it.each(["dragover", "drop"])(
		"cancels the browser default for %s anywhere in the document",
		(type) => {
			const target = fakeTarget();
			installDocumentDropGuard(target);
			const event = fakeEvent();

			target.listeners.get(type)?.(event as unknown as Event);

			expect(event.defaultPrevented).toBe(true);
		},
	);
});
