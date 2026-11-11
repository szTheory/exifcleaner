import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

// A deliberately networked story: it fires one fire-and-forget fetch to a
// reserved host (RFC 2606 .invalid). It is in no stories glob unless
// STORYBOOK_OFFLINE_NC=1 swaps the catalog to this file, which
// .storybook/offline.test.ts does to prove its collector sees the request.
function PlantedBody() {
	useEffect(() => {
		fetch("http://planted.invalid/").catch(() => undefined);
	}, []);
	return <p>Planted outbound request</p>;
}

const meta = {
	title: "Fixtures/OfflinePlanted",
	component: PlantedBody,
} satisfies Meta<typeof PlantedBody>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

export const Planted: StoryObj<typeof meta> = {};
