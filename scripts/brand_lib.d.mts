export interface BrandPin {
	repo: string;
	commit: string;
	url: string;
	sha256: string;
	size: number;
	root: string;
}
export type FetchBytes = (
	url: string,
	options?: { headers?: Record<string, string> },
) => Promise<Buffer>;
export class BrandError extends Error {}
export const PIN_FILE_NAME: string;
export const ALLOWLIST_FILE_NAME: string;
export const CACHE_DIR_NAME: string;
export const ZIP_FILE_NAME: string;
export const ZIP_ROOT: string;
export const BRAND_REPO: string;
export function pinUrl(repo: string, commit: string): string;
export function validatePin(pin: unknown): BrandPin;
export function readPin(pinPath: string): BrandPin;
export function serializePin(pin: BrandPin): string;
export function writePin(pinPath: string, pin: BrandPin): void;
export function sha256Hex(bytes: Buffer): string;
export function describePin(pin: BrandPin): string;
export function verifyBytes(bytes: Buffer, pin: BrandPin, label?: string): void;
export function extractZip(buffer: Buffer, destination: string): number;
export function safeEntryPath(name: string): string;
export function ensureBrand(args: {
	pin: BrandPin;
	cacheDir: string;
	mode?: "online" | "offline";
	fetchBytes?: FetchBytes;
	log?: (line: string) => void;
}): Promise<{
	zipPath: string;
	unpackedDir: string;
	brandRoot: string;
	downloaded: boolean;
	extracted: boolean;
}>;
export function parseAllowlist(text: string): string[];
export function shipBrand(args: {
	brandRoot: string;
	allowlistText: string;
	outDir: string;
}): string[];
export function resolveLatestCommit(args?: {
	repo?: string;
	fetchBytes?: FetchBytes;
	token?: string | undefined;
}): Promise<string>;
export function computePin(args: {
	repo?: string;
	commit: string;
	fetchBytes?: FetchBytes;
}): Promise<{ pin: BrandPin; bytes: Buffer }>;
