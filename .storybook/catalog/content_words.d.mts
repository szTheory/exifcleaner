export interface CoverageGlossary {
	functionWords: string[];
	terms: Array<{ forms: string[]; avoid: string[] }>;
	wordWaivers: Array<{ word: string }>;
}

export function tokenize(text: string): string[];

export function uncoveredWords(
	dict: Record<string, string>,
	glossary: CoverageGlossary,
): string[];

export function staleWordWaivers(
	dict: Record<string, string>,
	glossary: Pick<CoverageGlossary, "wordWaivers">,
	literals: readonly string[],
): string[];
