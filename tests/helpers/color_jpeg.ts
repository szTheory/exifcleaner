import fs from "node:fs";
import path from "node:path";

// A 16x16 three-component (YCbCr 4:2:0) baseline JPEG with no metadata segments. Every
// other JPEG fixture in this repo is a 1x1 grayscale image, and ExifTool only reports
// File:YCbCrSubSampling for three-component JPEGs (Image/ExifTool.pm SOF handling:
// "next unless $n == 3"), so those fixtures cannot exercise what a normal color photo
// produces. Generated with:
//   ffmpeg -f lavfi -i "testsrc=size=16x16:rate=1" -frames:v 1 -pix_fmt yuvj420p -q:v 8 -bitexact color.jpg
//   exiftool -all= -overwrite_original color.jpg
const COLOR_JPEG_BASE64 =
	"/9j/2wBDAAgQEBMQExYWFhYWFhoYGhsbGxoaGhobGxsdHR0iIiIdHR0bGx0dICAiIiUmJSMjIiMmJigoKDAwLi44ODpFRVP/xABsAAEBAQAAAAAAAAAAAAAAAAAGAwUBAQEAAAAAAAAAAAAAAAAAAAECEAACAgEDBAMBAQAAAAAAAAACAQMREgAEBTEiIRNSMmFBFBEAAQIGAgMBAQAAAAAAAAAAEQETEiIEAgMhMQBSFGFDM//AABEIABAAEAMBIgACEQADEQD/2gAMAwEAAhEDEQA/ADPpk47jYSAyCSQBkZRkSdHiQpNYtUJ93635a02328HhtyEkQAMSIfYAAKsHiixSx7qImPlLLrrKmGDecft1/oiDCOOJuxKsBAbfcqvDpqPLxT8jNJEMEo1VNAR39f5S+OpyCpSlWl02/wCx+R/mDFC4JuIgfvSyaoxYMocR6JLuF1UMTrJcEXDBtQLfHv8A/9k=";

export function writeColorJpeg({
	dir,
	name = "color.jpg",
}: {
	dir: string;
	name?: string;
}): string {
	const filePath = path.join(dir, name);
	fs.writeFileSync(filePath, Buffer.from(COLOR_JPEG_BASE64, "base64"));
	return filePath;
}
