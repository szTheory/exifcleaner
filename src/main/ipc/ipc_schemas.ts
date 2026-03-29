import { z } from "zod";

// invoke channels (renderer -> main, request-response)
export const exifReadSchema = z.string().min(1);
export const exifRemoveSchema = z.string().min(1);
export const getLocaleSchema = z.undefined();
export const getI18nStringsSchema = z.undefined();
export const settingsGetSchema = z.undefined();
export const settingsSetSchema = z.object({
	preserveOrientation: z.boolean().optional(),
	preserveColorProfile: z.boolean().optional(),
	saveAsCopy: z.boolean().optional(),
	removeXattrs: z.boolean().optional(),
	preserveTimestamps: z.boolean().optional(),
	language: z.string().nullable().optional(),
});
export const themeGetSchema = z.undefined();

// send channels (fire-and-forget, renderer -> main)
export const filesAddedSchema = z.number().int().positive();
export const fileProcessedSchema = z.undefined();
export const allFilesProcessedSchema = z.undefined();
