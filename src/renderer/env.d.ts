import type { ElectronApi } from "../preload/api_types";

declare global {
	interface Window {
		api: ElectronApi;
	}
}
