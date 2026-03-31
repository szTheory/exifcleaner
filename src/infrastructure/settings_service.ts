import { readFile, writeFile, rename } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import type { Settings, SettingsFile } from "../domain";
import {
	DEFAULT_SETTINGS,
	CURRENT_SCHEMA_VERSION,
	migrateSettings,
} from "../domain";
import type { SettingsPort } from "../application";
import type { LoggerPort } from "../application";

export class SettingsService implements SettingsPort {
	private readonly filePath: string;
	private readonly logger: LoggerPort;
	private cache: Settings = { ...DEFAULT_SETTINGS };

	constructor({ filePath, logger }: { filePath: string; logger: LoggerPort }) {
		this.filePath = filePath;
		this.logger = logger;
	}

	async load(): Promise<Settings> {
		try {
			const raw = await readFile(this.filePath, "utf-8");
			const parsed = JSON.parse(raw) as SettingsFile;
			const { settings, didMigrate } = migrateSettings(parsed);
			this.cache = settings;

			if (didMigrate) {
				await this.save(this.cache);
			}

			return this.cache;
		} catch (err: unknown) {
			this.logger.warn("Failed to load settings, using defaults", {
				filePath: this.filePath,
				error: String(err),
			});
			this.cache = { ...DEFAULT_SETTINGS };
			return this.cache;
		}
	}

	async save(settings: Settings): Promise<void> {
		const file: SettingsFile = {
			version: CURRENT_SCHEMA_VERSION,
			settings,
		};
		const json = JSON.stringify(file, null, "\t");
		const tempPath = this.filePath + "." + randomBytes(6).toString("hex");

		try {
			await writeFile(tempPath, json, "utf-8");
			await rename(tempPath, this.filePath);
			this.cache = settings;
		} catch (err: unknown) {
			this.logger.error("Failed to save settings, retrying", {
				filePath: this.filePath,
				error: String(err),
			});

			// One retry after 100ms
			try {
				await new Promise((resolve) => setTimeout(resolve, 100));
				await writeFile(tempPath, json, "utf-8");
				await rename(tempPath, this.filePath);
				this.cache = settings;
			} catch (retryErr: unknown) {
				this.logger.warn(
					"Settings save retry failed, changes cached in memory only",
					{
						filePath: this.filePath,
						error: String(retryErr),
					},
				);
				// Cache stays updated in memory for the session
				this.cache = settings;
			}
		}
	}

	get(): Settings {
		return this.cache;
	}

	async update(partial: Partial<Settings>): Promise<void> {
		const updated: Settings = { ...this.cache, ...partial };
		await this.save(updated);
	}
}
