/**
 * Composites macOS window chrome onto a bare app screenshot.
 *
 * The website draws its chrome in CSS (assets/css/_hero.css), which stays crisp at any
 * width and lets one screenshot serve the macOS, Windows, and Linux tabs. Markdown can't
 * do that, so the README needs the chrome baked in. Rendering it in Chromium rather than
 * compositing with ImageMagick means the same border-radius, titlebar, and box-shadow
 * values produce both surfaces -- they can't drift apart by hand-editing one of them.
 *
 * Output is a transparent PNG: the window floats on whatever background GitHub renders
 * behind it, in either theme.
 */

import { chromium } from "playwright";
import fs from "node:fs";

/** Mirrors --radius-lg in the website's assets/css/_tokens.css. */
const FRAME_RADIUS_PX = 16;
const TITLEBAR_HEIGHT_PX = 40;

/**
 * Transparent margin around the frame. The shadow is drawn outside the window box, so
 * without room to fall it gets clipped at the image edge and the window stops reading as
 * floating. Bottom is largest because the shadow is offset downward.
 */
const PADDING = { top: 40, side: 56, bottom: 72 };

interface ChromeTheme {
	titlebarBackground: string;
	titlebarBorder: string;
	titleColor: string;
	/** Shows through the rounded corners where the screenshot doesn't reach. */
	frameBackground: string;
}

const THEMES: Record<"light" | "dark", ChromeTheme> = {
	// Matches .screenshot-frame__titlebar in the website CSS exactly.
	light: {
		titlebarBackground: "#E8E8E8",
		titlebarBorder: "#D1D1D1",
		titleColor: "#4D4D4D",
		frameBackground: "#FFFFFF",
	},
	dark: {
		titlebarBackground: "#2C2C2E",
		titlebarBorder: "#1C1C1E",
		titleColor: "#DDDDDD",
		frameBackground: "#1A1A1A",
	},
};

function buildHtml({
	imageDataUri,
	imageWidth,
	theme,
}: {
	imageDataUri: string;
	imageWidth: number;
	theme: ChromeTheme;
}): string {
	return `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;background:transparent;">
  <div style="
    display:inline-block;
    padding:${PADDING.top}px ${PADDING.side}px ${PADDING.bottom}px;
  ">
    <div style="
      width:${imageWidth}px;
      border-radius:${FRAME_RADIUS_PX}px;
      overflow:hidden;
      background:${theme.frameBackground};
      box-shadow:
        0 30px 60px -12px rgba(0,0,0,0.28),
        0 8px 20px -8px rgba(0,0,0,0.18),
        0 0 0 1px rgba(0,0,0,0.06);
    ">
      <div style="
        position:relative;
        display:flex;
        align-items:center;
        height:${TITLEBAR_HEIGHT_PX}px;
        padding:0 16px;
        background:${theme.titlebarBackground};
        border-bottom:1px solid ${theme.titlebarBorder};
        box-sizing:border-box;
      ">
        <svg width="54" height="14" viewBox="0 0 54 14" style="flex-shrink:0;">
          <circle cx="7" cy="7" r="5.5" fill="#FF5F57"/>
          <circle cx="27" cy="7" r="5.5" fill="#FEBC2E"/>
          <circle cx="47" cy="7" r="5.5" fill="#28C840"/>
        </svg>
        <span style="
          position:absolute;
          left:50%;
          transform:translateX(-50%);
          font-family:system-ui,-apple-system,'Segoe UI',sans-serif;
          font-size:13px;
          font-weight:500;
          color:${theme.titleColor};
        ">ExifCleaner</span>
      </div>
      <img src="${imageDataUri}" style="display:block;width:100%;height:auto;">
    </div>
  </div>
</body>
</html>`;
}

const INSTALL_HINT =
	"Chromium is not installed. Run:\n\n  yarn playwright install chromium\n\n" +
	"The E2E suite drives Electron's own bundled Chromium via _electron, so a plain\n" +
	"`yarn install` never downloads a standalone browser -- only this framing step needs one.";

/**
 * Fails before the expensive Electron capture run rather than after it, so a missing
 * browser can't leave the website screenshots regenerated but the README ones stale.
 */
export async function assertChromiumAvailable(): Promise<void> {
	try {
		const browser = await chromium.launch();
		await browser.close();
	} catch (err: unknown) {
		const detail = err instanceof Error ? err.message : String(err);
		throw new Error(`${INSTALL_HINT}\n\nUnderlying error: ${detail}`);
	}
}

/**
 * @param width Logical CSS width of the framed window. The source screenshot is scaled to
 *   it, and the render happens at 2x, so the output PNG is roughly twice this plus padding.
 */
export async function frameScreenshot({
	inputPath,
	outputPath,
	theme,
	width = 1000,
}: {
	inputPath: string;
	outputPath: string;
	theme: "light" | "dark";
	width?: number;
}): Promise<void> {
	const imageDataUri = `data:image/png;base64,${fs.readFileSync(inputPath).toString("base64")}`;
	const html = buildHtml({
		imageDataUri,
		imageWidth: width,
		theme: THEMES[theme],
	});

	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({
			deviceScaleFactor: 2,
			viewport: {
				width: width + PADDING.side * 2,
				// Generous; the element clip below determines the real output height.
				height: 1200,
			},
		});
		await page.setContent(html, { waitUntil: "load" });

		const frame = page.locator("body > div");
		// omitBackground keeps the padding transparent AND lets Chromium composite the
		// shadow into the alpha channel, so the window reads as floating rather than
		// sitting on a white card.
		await frame.screenshot({ path: outputPath, omitBackground: true });
	} finally {
		await browser.close();
	}
}
