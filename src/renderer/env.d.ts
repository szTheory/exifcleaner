import type { ElectronApi } from "../preload/api_types";

declare global {
	interface Window {
		api: ElectronApi;
	}
}

// Augment React CSSProperties to allow CSS custom properties (--*)
declare module "react" {
	interface CSSProperties {
		[key: `--${string}`]: string | number | undefined;
	}
}
