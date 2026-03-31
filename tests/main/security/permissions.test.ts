import { describe, it, expect } from "vitest";
import { createFakeSession } from "../../fakes/electron_fakes";
import { installPermissionGate } from "../../../src/main/security/permissions";

describe("installPermissionGate", () => {
	it("denies all permission requests", () => {
		const fakeSession = createFakeSession();
		installPermissionGate(fakeSession);

		let granted: boolean | undefined;
		if (!fakeSession.permissionHandler) {
			throw new Error("permissionHandler not installed");
		}
		fakeSession.permissionHandler(null, "camera", (result) => {
			granted = result;
		});
		expect(granted).toBe(false);
	});

	it("denies different permission types", () => {
		const fakeSession = createFakeSession();
		installPermissionGate(fakeSession);

		const permissions = ["camera", "microphone", "geolocation", "notifications"];
		for (const permission of permissions) {
			let granted: boolean | undefined;
			fakeSession.permissionHandler!(null, permission, (result) => {
				granted = result;
			});
			expect(granted).toBe(false);
		}
	});
});
