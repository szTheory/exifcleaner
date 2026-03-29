import type { Settings } from "../domain/settings_schema";

export interface SettingsPort {
	load(): Promise<Settings>;
	save(settings: Settings): Promise<void>;
	get(): Settings;
	update(partial: Partial<Settings>): Promise<void>;
}
