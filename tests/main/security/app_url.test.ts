import { describe, expect, it } from "vitest";
import {
	isAppUrl,
	type AppUrlPolicy,
} from "../../../src/main/security/app_url";

const ENTRY =
	"file:///C:/Program%20Files/ExifCleaner/resources/app.asar/out/renderer/index.html";
const packaged: AppUrlPolicy = { isPackaged: true, rendererEntryUrl: ENTRY };

describe("isAppUrl", () => {
	it("accepts only the renderer entry among file:// URLs", () => {
		expect(isAppUrl(ENTRY, packaged)).toBe(true);
		expect(isAppUrl(`${ENTRY}?x=1#y`, packaged)).toBe(true);
		expect(isAppUrl("file:///C:/Users/me/Downloads/index.html", packaged)).toBe(
			false,
		);
	});

	it("ignores the dev server URL when packaged", () => {
		expect(
			isAppUrl("http://localhost:5173/", {
				...packaged,
				devServerUrl: "http://localhost:5173/",
			}),
		).toBe(false);
	});

	it("rejects unparseable URLs", () => {
		expect(isAppUrl("not a url", packaged)).toBe(false);
	});
});
