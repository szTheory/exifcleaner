import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeLogger } from "../fakes/fake_logger";

// We need to mock platform and child_process before importing
const mockExecFile = vi.fn();
const mockIsMac = vi.fn();

vi.mock("node:child_process", () => ({
	execFile: mockExecFile,
}));

vi.mock("../../src/common/platform", () => ({
	isMac: mockIsMac,
}));

// Import after mocks are set up
const { removeXattrs } = await import("../../src/infrastructure/xattr_service");

describe("removeXattrs", () => {
	let logger: FakeLogger;

	beforeEach(() => {
		logger = new FakeLogger();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("resolves immediately on non-macOS without calling execFile", async () => {
		mockIsMac.mockReturnValue(false);

		await removeXattrs({ filePath: "/tmp/photo.jpg", logger });

		expect(mockExecFile).not.toHaveBeenCalled();
	});

	it("calls the fixed xattr executable with a separated hostile pathname", async () => {
		mockIsMac.mockReturnValue(true);
		const hostilePath = '/tmp/foo"; touch sentinel; echo ".jpg';
		mockExecFile.mockImplementation(
			(
				_executable: string,
				_args: string[],
				callback: (error: Error | null) => void,
			) => {
				callback(null);
			},
		);

		await removeXattrs({ filePath: hostilePath, logger });

		expect(mockExecFile).toHaveBeenCalledTimes(1);
		expect(mockExecFile).toHaveBeenCalledWith(
			"/usr/bin/xattr",
			["-c", "--", hostilePath],
			expect.any(Function),
		);
		expect(mockExecFile.mock.calls[0]).toHaveLength(3);
	});

	it("logs warning and rejects on xattr errors", async () => {
		mockIsMac.mockReturnValue(true);
		mockExecFile.mockImplementation(
			(
				_executable: string,
				_args: string[],
				callback: (error: Error | null) => void,
			) => {
				callback(new Error("xattr: No such file"));
			},
		);

		await expect(
			removeXattrs({ filePath: "/tmp/missing.jpg", logger }),
		).rejects.toThrow("xattr: No such file");

		expect(logger.messages.some((m) => m.level === "warn")).toBe(true);
	});
});
