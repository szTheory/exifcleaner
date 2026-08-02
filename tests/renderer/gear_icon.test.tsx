import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GearIcon } from "../../src/renderer/components/icons/GearIcon";

describe("GearIcon", () => {
	it("renders the centered 16px concentric eight-tooth geometry", () => {
		const markup = renderToStaticMarkup(
			<GearIcon isOpen={false} onClick={() => undefined} />,
		);

		expect(markup).toContain('viewBox="0 0 16 16"');
		expect(markup).toContain('<circle cx="8" cy="8" r="2.4"');
		expect(markup).toContain('d="M6.85 1.09L9.15 1.09');
		expect(markup).toContain("L14.91 6.85L14.91 9.15");
		expect(markup).toContain("L1.09 9.15L1.09 6.85");
		expect(markup).toContain('L3.93 2.3L5.09 3.93L7.18 3.07Z"');
	});
});
