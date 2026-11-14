export interface Rgba {
	r: number;
	g: number;
	b: number;
	a: number;
}

export interface Rgb {
	r: number;
	g: number;
	b: number;
}

export function parseColour(text: string): Rgba | null;

export function flatten(top: Rgba, under: Rgb): Rgba;

export function relativeLuminance(colour: Rgb): number;

export function contrastRatio(first: Rgb, second: Rgb): number;

export function floor2(value: number): number;

export function formatRatio(value: number): string;

export function toHex(colour: Rgb): string;
