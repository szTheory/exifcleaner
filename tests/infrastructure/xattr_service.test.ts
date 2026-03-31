import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeLogger } from "../fakes/fake_logger";

// We need to mock platform and child_process before importing
const mockExec = vi.fn();
const mockIsMac = vi.fn();

vi.mock("node:child_process", () => ({
	exec: mockExec,
}));

vi.mock("../../src/common/platform", () => ({
	isMac: mockIsMac,
}));

// Import after mocks are set up
const { removeXattrs } = await import(
	"../../src/infrastructure/xattr/xattr_service"
);

describe("removeXattrs", () => {
	let logger: FakeLogger;

	beforeEach(() => {
		logger = new FakeLogger();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("resolves immediately on non-macOS without calling exec", async () => {
		mockIsMac.mockReturnValue(false);

		await removeXattrs({ filePath: "/tmp/photo.jpg", logger });

		expect(mockExec).not.toHaveBeenCalled();
	});

	it("calls exec with xattr -cr on macOS", async () => {
		mockIsMac.mockReturnValue(true);
		mockExec.mockImplementation(
			(
				_cmd: string,
				callback: (error: Error | null) => void,
			) => {
				callback(null);
			},
		);

		await removeXattrs({ filePath: "/tmp/photo.jpg", logger });

		expect(mockExec).toHaveBeenCalledTimes(1);
		const cmd = mockExec.mock.calls[0]![0] as string;
		expect(cmd).toContain("xattr -cr");
		expect(cmd).toContain("/tmp/photo.jpg");
	});

	it("logs warning on exec error but still resolves (non-fatal)", async () => {
		mockIsMac.mockReturnValue(true);
		mockExec.mockImplementation(
			(
				_cmd: string,
				callback: (error: Error | null) => void,
			) => {
				callback(new Error("xattr: No such file"));
			},
		);

		// Should not throw
		await removeXattrs({ filePath: "/tmp/missing.jpg", logger });

		expect(logger.messages.some((m) => m.level === "warn")).toBe(true);
	});
});
