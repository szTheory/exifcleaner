export interface CssDeclaration {
	selectors: string[];
	property: string;
	value: string;
	line: number;
}

export const TOKEN_SCAN_ROOT: string;

export function stripCssComments(text: string): string;

export function stripScriptComments(text: string): string;

export function cssDeclarations(css: string): CssDeclaration[];

export function customPropertyDeclarations(css: string): CssDeclaration[];

export function usedCustomProperties(fileName: string, text: string): string[];

export function dynamicCustomPropertyNames(
	fileName: string,
	text: string,
): string[];

export function listTokenScanFiles(root: string): string[];
