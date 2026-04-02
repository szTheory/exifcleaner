import type { SettingsPort } from "../../src/application/settings_port";
import type { Settings } from "../../src/domain/settings_schema";
import { DEFAULT_SETTINGS } from "../../src/domain/settings_schema";

export class FakeSettings implements SettingsPort {
	private settings: Settings = { ...DEFAULT_SETTINGS };

	async load(): Promise<Settings> {
		return { ...this.settings };
	}

	async save({ settings }: { settings: Settings }): Promise<void> {
		this.settings = { ...settings };
	}

	get(): Settings {
		return { ...this.settings };
	}

	async update({ partial }: { partial: Partial<Settings> }): Promise<void> {
		this.settings = { ...this.settings, ...partial };
	}
}
