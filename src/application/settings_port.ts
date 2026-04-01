import type { Settings } from "../domain";

export interface SettingsPort {
	load(): Promise<Settings>;
	save({ settings }: { settings: Settings }): Promise<void>;
	get(): Settings;
	update({ partial }: { partial: Partial<Settings> }): Promise<void>;
}
