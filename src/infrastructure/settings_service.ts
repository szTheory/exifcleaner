import { readFile, writeFile, rename } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import type { Settings, SettingsFile } from "../domain";

const SETTINGS_SAVE_RETRY_DELAY_MS = 100;
import {
	DEFAULT_SETTINGS,
	CURRENT_SCHEMA_VERSION,
	migrateSettings,
	isSettingsFile,
	formatSettingsError,
} from "../domain";
import type { SettingsPort } from "../application";
import type { LoggerPort } from "../application";

// Validates current-schema OR legacy settings files (which need migration).
// isSettingsFile only passes for current-schema shape, so legacy v1/v2 files
// need a looser check before being passed to migrateSettings.
function isSettingsFileOrLegacy(value: unknown): value is SettingsFile {
	if (isSettingsFile(value)) return true;
	if (typeof value !== "object" || value === null) return false;
	const obj: Record<string, unknown> = Object.create(null);
	Object.assign(obj, value);
	return (
		typeof obj["version"] === "number" &&
		typeof obj["settings"] === "object" &&
		obj["settings"] !== null
	);
}

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
			const parsed: unknown = JSON.parse(raw);
			// Accept current-schema files via full validation, or legacy files
			// that have version+settings for migration. isSettingsFile checks
			// current-schema shape, so older versions won't pass it.
			if (!isSettingsFileOrLegacy(parsed)) {
				this.logger.warn({
					message: formatSettingsError({
						code: "invalid-format",
						filePath: this.filePath,
					}),
					context: { filePath: this.filePath },
				});
				this.cache = { ...DEFAULT_SETTINGS };
				return this.cache;
			}
			const { settings, didMigrate } = migrateSettings({ file: parsed });
			this.cache = settings;

			if (didMigrate) {
				await this.save({ settings: this.cache });
			}

			return this.cache;
		} catch (err: unknown) {
			this.logger.warn({
				message: formatSettingsError({
					code: "read-failed",
					filePath: this.filePath,
					cause: String(err),
				}),
				context: { filePath: this.filePath },
			});
			this.cache = { ...DEFAULT_SETTINGS };
			return this.cache;
		}
	}

	async save({ settings }: { settings: Settings }): Promise<void> {
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
			this.logger.error({
				message: formatSettingsError({
					code: "write-failed",
					filePath: this.filePath,
					cause: String(err),
				}),
				context: { filePath: this.filePath },
			});

			try {
				await new Promise((resolve) =>
					setTimeout(resolve, SETTINGS_SAVE_RETRY_DELAY_MS),
				);
				await writeFile(tempPath, json, "utf-8");
				await rename(tempPath, this.filePath);
				this.cache = settings;
			} catch (retryErr: unknown) {
				this.logger.warn({
					message: formatSettingsError({
						code: "write-failed",
						filePath: this.filePath,
						cause: String(retryErr),
					}),
					context: { filePath: this.filePath },
				});
				// Cache stays updated in memory for the session
				this.cache = settings;
			}
		}
	}

	get(): Settings {
		return this.cache;
	}

	async update({ partial }: { partial: Partial<Settings> }): Promise<void> {
		const updated: Settings = { ...this.cache, ...partial };
		await this.save({ settings: updated });
	}
}
