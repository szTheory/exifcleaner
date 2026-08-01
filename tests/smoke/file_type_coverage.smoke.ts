import { test } from "@playwright/test";
import {
	runMixedFormatScenario,
	runPositiveFormatScenario,
} from "../helpers/processing_driver";
import {
	closePackagedApp,
	launchPackagedApp,
} from "./helpers/packaged_launcher";

test.describe.configure({ mode: "serial" });

for (const fixture of [
	"sample.jpg",
	"sample.png",
	"sample.webp",
	"sample.pdf",
	"sample.mp4",
]) {
	test(`${fixture} processes through the installed artifact`, async () => {
		const context = await launchPackagedApp();
		try {
			await runPositiveFormatScenario(context, fixture);
		} finally {
			await closePackagedApp(context);
		}
	});
}

test("mixed advertised formats process through the installed artifact", async () => {
	const context = await launchPackagedApp();
	try {
		await runMixedFormatScenario(context);
	} finally {
		await closePackagedApp(context);
	}
});
