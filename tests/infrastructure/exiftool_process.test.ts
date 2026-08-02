import { describe, expect, it } from "vitest";
import {
	ExiftoolProcess,
	UnsafeExifToolPathError,
} from "../../src/infrastructure/exiftool/ExiftoolProcess";

describe("ExiftoolProcess path protocol boundary", () => {
	const process = new ExiftoolProcess({ binPath: "/unused/exiftool" });

	it.each(["/tmp/photo\n-execute9.jpg", "/tmp/photo\r-stay_open.jpg"])(
		"rejects unsafe read paths before writing the stay-open protocol",
		async (filePath) => {
			await expect(
				process.readMetadata({ filePath, args: [] }),
			).rejects.toBeInstanceOf(UnsafeExifToolPathError);
		},
	);

	it("rejects unsafe generated/write paths before writing the protocol", async () => {
		await expect(
			process.writeMetadata({
				filePath: "/tmp/generated\r\n-overwrite_original.jpg",
				metadata: {},
				extraArgs: ["-all="],
			}),
		).rejects.toBeInstanceOf(UnsafeExifToolPathError);
	});
});
