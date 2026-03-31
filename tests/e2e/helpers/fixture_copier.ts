import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createFixtureDir(): {
	dir: string;
	copyFixture: (name: string) => string;
	copyFixtures: (names: string[]) => string[];
	cleanup: () => void;
} {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exifcleaner-e2e-"));

	function copyFixture(name: string): string {
		const src = path.resolve(__dirname, "../fixtures", name);
		const dest = path.join(dir, name);
		fs.copyFileSync(src, dest);
		return dest;
	}

	function copyFixtures(names: string[]): string[] {
		return names.map((name) => copyFixture(name));
	}

	function cleanup(): void {
		fs.rmSync(dir, { recursive: true, force: true });
	}

	return { dir, copyFixture, copyFixtures, cleanup };
}
