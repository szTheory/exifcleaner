// Story support only (D-03, H4): the TypePill stories render one story per colour
// family, and a story file cannot export a plain list for a node test to import, so
// the lists live here. .storybook/type_pill_families.test.ts proves that every
// supported extension is in exactly one family or in NEUTRAL.
//
// Extensions are lowercase without the leading dot; the stories render them as the
// uppercase text the file table shows. Each family is the set of extensions that
// type_pill.css colours alike, aliases included (jpeg with jpg, heif with heic, the
// media and RAW groups); NEUTRAL is the set the stylesheet has no family colour for.
export const TYPE_PILL_FAMILIES: Readonly<
	Record<"jpeg" | "heic" | "png" | "pdf" | "media" | "raw", readonly string[]>
> = Object.freeze({
	jpeg: Object.freeze(["jpg", "jpeg"]),
	heic: Object.freeze(["heic", "heif"]),
	png: Object.freeze(["png"]),
	pdf: Object.freeze(["pdf"]),
	media: Object.freeze(["mov", "mp4", "m4a", "m4v", "avi", "3gp", "wmv"]),
	raw: Object.freeze([
		"dng",
		"cr2",
		"cr3",
		"nef",
		"arw",
		"orf",
		"rw2",
		"raf",
		"pef",
		"srw",
	]),
});

export const NEUTRAL: readonly string[] = Object.freeze([
	"gif",
	"tiff",
	"tif",
	"webp",
	"avif",
	"bmp",
	"svg",
]);
