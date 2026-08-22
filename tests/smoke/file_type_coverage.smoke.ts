import { test } from "@playwright/test";
import {
	runErrorFormatScenario,
	runRafRefusalScenario,
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
	"sample.m4a",
] as const) {
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

test("corrupted JPEG reports a detailed installed-artifact error", async () => {
	const context = await launchPackagedApp();
	try {
		await runErrorFormatScenario(context, "corrupted.jpg");
	} finally {
		await closePackagedApp(context);
	}
});

test("truncated MP4 is rejected by the bundled installed ExifTool", async () => {
	const context = await launchPackagedApp();
	try {
		await runErrorFormatScenario(context, "truncated.mp4");
	} finally {
		await closePackagedApp(context);
	}
});

test("RAF is refused without modifying the original or writing an artifact", async () => {
	const context = await launchPackagedApp();
	try {
		await runRafRefusalScenario(context);
	} finally {
		await closePackagedApp(context);
	}
});
