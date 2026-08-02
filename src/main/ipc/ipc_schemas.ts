import { z } from "zod";

const filePathSchema = z
	.string()
	.min(1)
	.refine((filePath) => !/[\r\n]/u.test(filePath), {
		message: "Paths containing line breaks are not supported",
	});

// invoke channels (renderer -> main, request-response)
export const exifReadSchema = filePathSchema;
export const exifRemoveSchema = filePathSchema;
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
	themeMode: z.enum(["light", "dark", "system"]).optional(),
});
export const themeGetSchema = z.undefined();
export const themeSetSchema = z.enum(["light", "dark", "system"]);
export const themeAccentColorSchema = z.undefined();

// File reveal channels accept one validated local path.
export const fileRevealSchema = filePathSchema;
export const fileRevealContextMenuSchema = z.object({
	cleanedPath: filePathSchema,
	originalPath: filePathSchema,
});

// Folder intake validates each path before filesystem traversal.
export const folderClassifySchema = z.array(filePathSchema);
export const folderExpandSchema = filePathSchema;
export const filesChooseSchema = z.undefined();
export const folderChooseSchema = z.undefined();

// send channels (fire-and-forget, renderer -> main)
export const filesAddedSchema = z.number().int().positive();
export const fileProcessedSchema = z.undefined();
export const allFilesProcessedSchema = z.undefined();
