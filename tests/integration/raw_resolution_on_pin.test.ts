// Phase 52-05 (FID-04, D-35): pins the RAW ON output as its own literal (mirroring 51.1's
// D-46 raw_residue_pin.test.ts style), proves ON versus OFF on the same seeded input matches
// what tests/e2e/raw-resolution.spec.ts measured through the real app, and proves the oracle
// itself fails on an injected identifying-tag copy-back and a resolution relocation into
// XMP-tiff.
//
// PINNED_ON_OUTPUT_KEYS is the full ordered `-a -G3:1 -s -n --System:all` key list of the
// product adapter's own default-ON (preserveResolution: true) output, per RAW_CASES fixture,
// hand-pasted from a measured run (bundled ExifTool 13.59, 2026-09-23) -- never a vitest
// snapshot assertion and never a `.length` count. Duplicates are preserved in
// file order (CR3 legitimately reports `File:ExifByteOrder` twice, the same embedded-document
// duplication raw_residue_pin.test.ts documents for its own OFF pin). Regenerate only by
// re-running the same seed-and-clean and re-pasting the measured output, never by a script
// wired into this test file. 51.1's OFF pins live in raw_residue_pin.test.ts and are not
// duplicated or edited here.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import {
	RAW_IDENTIFYING_TAG_DELETES,
	QUICKTIME_DATE_REMOVAL_ARGS,
	RESOLUTION_PRESERVE_ARGS,
} from "../../src/domain/exif/exif";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import {
	RAW_CASES,
	readRawTagLines,
	tagLineDifferential,
} from "../helpers/raw_probe";
import {
	RAW_RESOLUTION_SEED_ARGS,
	resolutionDeltaViolations,
	seedFile,
} from "../helpers/resolution_probe";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");
const FIXTURES_DIR = path.resolve(__dirname, "../e2e/fixtures");

// Group-qualified writes to -IFD0:* land under a bare IFD0: prefix on CR2/DNG/CR3, but under
// Doc1:IFD0: on RW2 (its IFD0 lives in the embedded JpgFromRaw preview) -- same rule
// raw-resolution.spec.ts (Task 1) uses.
function resolutionGroupPrefix(fixture: string): string {
	return fixture === "Panasonic.rw2" ? "Doc1:IFD0" : "IFD0";
}

function resolutionSeedExpect(fixture: string): Record<string, string> {
	const prefix = resolutionGroupPrefix(fixture);
	return {
		[`${prefix}:XResolution`]: "300",
		[`${prefix}:YResolution`]: "300",
		[`${prefix}:ResolutionUnit`]: "2",
	};
}

// Measured 2026-09-23 against the product adapter's own default arguments
// (preserveOrientation and preserveColorProfile true, preserveResolution true,
// preserveTimestamps false), via `ExifToolAdapter.sanitize()` -> `readRawTagLines(destination,
// EXIFTOOL_PATH)`, on a scratch copy seeded with RAW_RESOLUTION_SEED_ARGS.
const PINNED_ON_OUTPUT_KEYS: Readonly<Record<string, readonly string[]>> = {
	"CanonRaw.cr2": [
		"ExifTool:ExifToolVersion",
		"File:FileType",
		"File:FileTypeExtension",
		"File:MIMEType",
		"File:ExifByteOrder",
		"IFD0:ImageWidth",
		"IFD0:ImageHeight",
		"IFD0:BitsPerSample",
		"IFD0:Compression",
		"IFD0:Make",
		"IFD0:Model",
		"IFD0:PreviewImageStart",
		"IFD0:Orientation",
		"IFD0:PreviewImageLength",
		"IFD0:XResolution",
		"IFD0:YResolution",
		"IFD0:ResolutionUnit",
		"IFD0:PreviewImage",
		"ExifIFD:ExposureTime",
		"ExifIFD:FNumber",
		"ExifIFD:ExposureProgram",
		"ExifIFD:ISO",
		"ExifIFD:ExifVersion",
		"ExifIFD:ComponentsConfiguration",
		"ExifIFD:ShutterSpeedValue",
		"ExifIFD:ApertureValue",
		"ExifIFD:ExposureCompensation",
		"ExifIFD:MeteringMode",
		"ExifIFD:Flash",
		"ExifIFD:FocalLength",
		"ExifIFD:FlashpixVersion",
		"ExifIFD:ColorSpace",
		"ExifIFD:ExifImageWidth",
		"ExifIFD:ExifImageHeight",
		"ExifIFD:FocalPlaneXResolution",
		"ExifIFD:FocalPlaneYResolution",
		"ExifIFD:FocalPlaneResolutionUnit",
		"ExifIFD:CustomRendered",
		"ExifIFD:ExposureMode",
		"ExifIFD:WhiteBalance",
		"ExifIFD:SceneCaptureType",
		"Canon:MacroMode",
		"Canon:SelfTimer",
		"Canon:Quality",
		"Canon:CanonFlashMode",
		"Canon:ContinuousDrive",
		"Canon:FocusMode",
		"Canon:RecordMode",
		"Canon:CanonImageSize",
		"Canon:EasyMode",
		"Canon:DigitalZoom",
		"Canon:Contrast",
		"Canon:Saturation",
		"Canon:Sharpness",
		"Canon:MeteringMode",
		"Canon:FocusRange",
		"Canon:CanonExposureMode",
		"Canon:LensType",
		"Canon:MaxFocalLength",
		"Canon:MinFocalLength",
		"Canon:FocalUnits",
		"Canon:MaxAperture",
		"Canon:MinAperture",
		"Canon:FlashModel",
		"Canon:FlashBits",
		"Canon:FocusContinuous",
		"Canon:ZoomSourceWidth",
		"Canon:ZoomTargetWidth",
		"Canon:PhotoEffect",
		"Canon:ManualFlashOutput",
		"Canon:ColorTone",
		"Canon:FocalType",
		"Canon:FocalLength",
		"Canon:FocalPlaneXSize",
		"Canon:FocalPlaneYSize",
		"Canon:AutoISO",
		"Canon:BaseISO",
		"Canon:MeasuredEV",
		"Canon:TargetAperture",
		"Canon:TargetExposureTime",
		"Canon:ExposureCompensation",
		"Canon:WhiteBalance",
		"Canon:SlowShutter",
		"Canon:SequenceNumber",
		"Canon:OpticalZoomCode",
		"Canon:FlashGuideNumber",
		"Canon:FlashExposureComp",
		"Canon:AutoExposureBracketing",
		"Canon:AEBBracketValue",
		"Canon:ControlMode",
		"Canon:FNumber",
		"Canon:ExposureTime",
		"Canon:MeasuredEV2",
		"Canon:BulbDuration",
		"Canon:CameraType",
		"Canon:AutoRotate",
		"Canon:NDFilter",
		"Canon:SelfTimer2",
		"Canon:CanonImageType",
		"Canon:CanonFirmwareVersion",
		"Canon:OwnerName",
		"Canon:SerialNumber",
		"Canon:CanonModelID",
		"Canon:NumAFPoints",
		"Canon:ValidAFPoints",
		"Canon:CanonImageWidth",
		"Canon:CanonImageHeight",
		"Canon:AFImageWidth",
		"Canon:AFImageHeight",
		"Canon:AFAreaWidth",
		"Canon:AFAreaHeight",
		"Canon:AFAreaXPositions",
		"Canon:AFAreaYPositions",
		"Canon:AFPointsInFocus",
		"Canon:ThumbnailImageValidArea",
		"Canon:SerialNumberFormat",
		"Canon:OriginalDecisionDataOffset",
		"Canon:FileNumber",
		"Canon:BracketMode",
		"Canon:BracketValue",
		"Canon:BracketShotNumber",
		"Canon:LongExposureNoiseReduction2",
		"Canon:WBBracketMode",
		"Canon:WBBracketValueAB",
		"Canon:WBBracketValueGM",
		"Canon:FilterEffect",
		"Canon:ToningEffect",
		"Canon:ToneCurve",
		"Canon:SharpnessFrequency",
		"Canon:SensorRedLevel",
		"Canon:SensorBlueLevel",
		"Canon:WhiteBalanceRed",
		"Canon:WhiteBalanceBlue",
		"Canon:ColorTemperature",
		"Canon:PictureStyle",
		"Canon:DigitalGain",
		"Canon:WBShiftAB",
		"Canon:WBShiftGM",
		"Canon:MeasuredRGGB",
		"Canon:VRDOffset",
		"Canon:SensorWidth",
		"Canon:SensorHeight",
		"Canon:SensorLeftBorder",
		"Canon:SensorTopBorder",
		"Canon:SensorRightBorder",
		"Canon:SensorBottomBorder",
		"Canon:BlackMaskLeftBorder",
		"Canon:BlackMaskTopBorder",
		"Canon:BlackMaskRightBorder",
		"Canon:BlackMaskBottomBorder",
		"Canon:WB_RGGBLevelsAsShot",
		"Canon:ColorTempAsShot",
		"Canon:WB_RGGBLevelsAuto",
		"Canon:ColorTempAuto",
		"Canon:WB_RGGBLevelsDaylight",
		"Canon:ColorTempDaylight",
		"Canon:WB_RGGBLevelsShade",
		"Canon:ColorTempShade",
		"Canon:WB_RGGBLevelsCloudy",
		"Canon:ColorTempCloudy",
		"Canon:WB_RGGBLevelsTungsten",
		"Canon:ColorTempTungsten",
		"Canon:WB_RGGBLevelsFluorescent",
		"Canon:ColorTempFluorescent",
		"Canon:WB_RGGBLevelsFlash",
		"Canon:ColorTempFlash",
		"Canon:WB_RGGBLevelsCustom1",
		"Canon:ColorTempCustom1",
		"Canon:WB_RGGBLevelsCustom2",
		"Canon:ColorTempCustom2",
		"Canon:ColorTone",
		"CanonCustom:SetButtonCrossKeysFunc",
		"CanonCustom:LongExposureNoiseReduction",
		"CanonCustom:FlashSyncSpeedAv",
		"CanonCustom:Shutter-AELock",
		"CanonCustom:AFAssistBeam",
		"CanonCustom:ExposureLevelIncrements",
		"CanonCustom:MirrorLockup",
		"CanonCustom:ETTLII",
		"CanonCustom:ShutterCurtainSync",
		"InteropIFD:InteropIndex",
		"InteropIFD:InteropVersion",
		"IFD1:XResolution",
		"IFD1:YResolution",
		"IFD1:ResolutionUnit",
		"IFD1:ThumbnailOffset",
		"IFD1:ThumbnailLength",
		"IFD1:ThumbnailImage",
		"IFD2:ImageWidth",
		"IFD2:ImageHeight",
		"IFD2:BitsPerSample",
		"IFD2:Compression",
		"IFD2:PhotometricInterpretation",
		"IFD2:StripOffsets",
		"IFD2:SamplesPerPixel",
		"IFD2:RowsPerStrip",
		"IFD2:StripByteCounts",
		"IFD2:PlanarConfiguration",
		"IFD3:Compression",
		"IFD3:StripOffsets",
		"IFD3:StripByteCounts",
		"IFD3:CR2CFAPattern",
		"IFD3:RawImageSegmentation",
		"Composite:DriveMode",
		"Composite:ISO",
		"Composite:Lens",
		"Composite:ShootingMode",
		"Composite:WB_RGGBLevels",
		"Composite:Aperture",
		"Composite:BlueBalance",
		"Composite:ImageSize",
		"Composite:LensID",
		"Composite:Megapixels",
		"Composite:RedBalance",
		"Composite:ScaleFactor35efl",
		"Composite:ShutterSpeed",
		"Composite:Lens35efl",
		"Composite:CircleOfConfusion",
		"Composite:FOV",
		"Composite:FocalLength35efl",
		"Composite:HyperfocalDistance",
		"Composite:LightValue",
	],
	"DNG.dng": [
		"ExifTool:ExifToolVersion",
		"File:FileType",
		"File:FileTypeExtension",
		"File:MIMEType",
		"File:ExifByteOrder",
		"IFD0:SubfileType",
		"IFD0:ImageWidth",
		"IFD0:ImageHeight",
		"IFD0:BitsPerSample",
		"IFD0:Compression",
		"IFD0:PhotometricInterpretation",
		"IFD0:Make",
		"IFD0:Model",
		"IFD0:StripOffsets",
		"IFD0:Orientation",
		"IFD0:SamplesPerPixel",
		"IFD0:RowsPerStrip",
		"IFD0:StripByteCounts",
		"IFD0:XResolution",
		"IFD0:YResolution",
		"IFD0:PlanarConfiguration",
		"IFD0:ResolutionUnit",
		"IFD0:ImageNumber",
		"IFD0:DNGVersion",
		"IFD0:DNGBackwardVersion",
		"IFD0:UniqueCameraModel",
		"IFD0:LocalizedCameraModel",
		"IFD0:ColorMatrix1",
		"IFD0:ColorMatrix2",
		"IFD0:CameraCalibration1",
		"IFD0:CameraCalibration2",
		"IFD0:AnalogBalance",
		"IFD0:AsShotNeutral",
		"IFD0:BaselineExposure",
		"IFD0:BaselineNoise",
		"IFD0:BaselineSharpness",
		"IFD0:LinearResponseLimit",
		"IFD0:DNGLensInfo",
		"IFD0:ShadowScale",
		"IFD0:CalibrationIlluminant1",
		"IFD0:CalibrationIlluminant2",
		"IFD0:ThumbnailTIFF",
		"SubIFD:SubfileType",
		"SubIFD:ImageWidth",
		"SubIFD:ImageHeight",
		"SubIFD:BitsPerSample",
		"SubIFD:Compression",
		"SubIFD:PhotometricInterpretation",
		"SubIFD:SamplesPerPixel",
		"SubIFD:PlanarConfiguration",
		"SubIFD:TileWidth",
		"SubIFD:TileLength",
		"SubIFD:TileOffsets",
		"SubIFD:TileByteCounts",
		"SubIFD:CFARepeatPatternDim",
		"SubIFD:CFAPattern2",
		"SubIFD:CFAPlaneColor",
		"SubIFD:CFALayout",
		"SubIFD:BlackLevelRepeatDim",
		"SubIFD:BlackLevel",
		"SubIFD:WhiteLevel",
		"SubIFD:DefaultScale",
		"SubIFD:DefaultCropOrigin",
		"SubIFD:DefaultCropSize",
		"SubIFD:BayerGreenSplit",
		"SubIFD:AntiAliasStrength",
		"SubIFD:BestQualityScale",
		"SubIFD:ActiveArea",
		"SubIFD:MaskedAreas",
		"SubIFD1:SubfileType",
		"SubIFD1:ImageWidth",
		"SubIFD1:ImageHeight",
		"SubIFD1:BitsPerSample",
		"SubIFD1:Compression",
		"SubIFD1:PhotometricInterpretation",
		"SubIFD1:PreviewImageStart",
		"SubIFD1:SamplesPerPixel",
		"SubIFD1:RowsPerStrip",
		"SubIFD1:PreviewImageLength",
		"SubIFD1:PlanarConfiguration",
		"SubIFD1:YCbCrCoefficients",
		"SubIFD1:YCbCrSubSampling",
		"SubIFD1:YCbCrPositioning",
		"SubIFD1:ReferenceBlackWhite",
		"SubIFD1:PreviewImage",
		"SubIFD2:SubfileType",
		"SubIFD2:ImageWidth",
		"SubIFD2:ImageHeight",
		"SubIFD2:BitsPerSample",
		"SubIFD2:Compression",
		"SubIFD2:PhotometricInterpretation",
		"SubIFD2:JpgFromRawStart",
		"SubIFD2:SamplesPerPixel",
		"SubIFD2:RowsPerStrip",
		"SubIFD2:JpgFromRawLength",
		"SubIFD2:PlanarConfiguration",
		"SubIFD2:YCbCrCoefficients",
		"SubIFD2:YCbCrSubSampling",
		"SubIFD2:YCbCrPositioning",
		"SubIFD2:ReferenceBlackWhite",
		"SubIFD2:JpgFromRaw",
		"Composite:CFAPattern",
		"Composite:ImageSize",
		"Composite:Megapixels",
	],
	"CanonRaw.cr3": [
		"ExifTool:ExifToolVersion",
		"File:FileType",
		"File:FileTypeExtension",
		"File:MIMEType",
		"File:ExifByteOrder",
		"File:ExifByteOrder",
		"QuickTime:MajorBrand",
		"QuickTime:MinorVersion",
		"QuickTime:CompatibleBrands",
		"QuickTime:MovieHeaderVersion",
		"QuickTime:CreateDate",
		"QuickTime:ModifyDate",
		"QuickTime:TimeScale",
		"QuickTime:Duration",
		"QuickTime:PreferredRate",
		"QuickTime:PreferredVolume",
		"QuickTime:MatrixStructure",
		"QuickTime:PreviewTime",
		"QuickTime:PreviewDuration",
		"QuickTime:PosterTime",
		"QuickTime:SelectionTime",
		"QuickTime:SelectionDuration",
		"QuickTime:CurrentTime",
		"QuickTime:NextTrackID",
		"QuickTime:PreviewImage",
		"QuickTime:MediaDataSize",
		"QuickTime:MediaDataOffset",
		"Canon:CompressorVersion",
		"Canon:MacroMode",
		"Canon:SelfTimer",
		"Canon:Quality",
		"Canon:CanonFlashMode",
		"Canon:ContinuousDrive",
		"Canon:FocusMode",
		"Canon:RecordMode",
		"Canon:CanonImageSize",
		"Canon:EasyMode",
		"Canon:DigitalZoom",
		"Canon:Contrast",
		"Canon:Saturation",
		"Canon:CameraISO",
		"Canon:MeteringMode",
		"Canon:FocusRange",
		"Canon:CanonExposureMode",
		"Canon:LensType",
		"Canon:MaxFocalLength",
		"Canon:MinFocalLength",
		"Canon:FocalUnits",
		"Canon:MaxAperture",
		"Canon:MinAperture",
		"Canon:FlashModel",
		"Canon:FlashBits",
		"Canon:ZoomSourceWidth",
		"Canon:ZoomTargetWidth",
		"Canon:ManualFlashOutput",
		"Canon:ColorTone",
		"Canon:SRAWQuality",
		"Canon:FocalLength",
		"Canon:AutoISO",
		"Canon:BaseISO",
		"Canon:MeasuredEV",
		"Canon:TargetAperture",
		"Canon:TargetExposureTime",
		"Canon:ExposureCompensation",
		"Canon:WhiteBalance",
		"Canon:SlowShutter",
		"Canon:SequenceNumber",
		"Canon:OpticalZoomCode",
		"Canon:CameraTemperature",
		"Canon:FlashGuideNumber",
		"Canon:FlashExposureComp",
		"Canon:AutoExposureBracketing",
		"Canon:AEBBracketValue",
		"Canon:ControlMode",
		"Canon:FNumber",
		"Canon:ExposureTime",
		"Canon:MeasuredEV2",
		"Canon:BulbDuration",
		"Canon:CameraType",
		"Canon:AutoRotate",
		"Canon:NDFilter",
		"Canon:CanonImageType",
		"Canon:CanonFirmwareVersion",
		"Canon:OwnerName",
		"Canon:CanonModelID",
		"Canon:ThumbnailImageValidArea",
		"Canon:AFAreaMode",
		"Canon:NumAFPoints",
		"Canon:ValidAFPoints",
		"Canon:CanonImageWidth",
		"Canon:CanonImageHeight",
		"Canon:AFImageWidth",
		"Canon:AFImageHeight",
		"Canon:AFAreaWidths",
		"Canon:AFAreaHeights",
		"Canon:AFAreaXPositions",
		"Canon:AFAreaYPositions",
		"Canon:AFPointsInFocus",
		"Canon:AFPointsSelected",
		"Canon:ImageUniqueID",
		"Canon:TimeZone",
		"Canon:TimeZoneCity",
		"Canon:DaylightSavings",
		"Canon:BatteryType",
		"Canon:BracketMode",
		"Canon:BracketValue",
		"Canon:BracketShotNumber",
		"Canon:RawJpgSize",
		"Canon:WBBracketMode",
		"Canon:WBBracketValueAB",
		"Canon:WBBracketValueGM",
		"Canon:LiveViewShooting",
		"Canon:FocusDistanceUpper",
		"Canon:FocusDistanceLower",
		"Canon:ShutterMode",
		"Canon:FlashExposureLock",
		"Canon:AntiFlicker",
		"Canon:RFLensType",
		"Canon:LensModel",
		"Canon:InternalSerialNumber",
		"Canon:DustRemovalData",
		"Canon:CropLeftMargin",
		"Canon:CropRightMargin",
		"Canon:CropTopMargin",
		"Canon:CropBottomMargin",
		"Canon:AspectRatio",
		"Canon:CroppedImageWidth",
		"Canon:CroppedImageHeight",
		"Canon:CroppedImageLeft",
		"Canon:CroppedImageTop",
		"Canon:ToneCurve",
		"Canon:Sharpness",
		"Canon:SharpnessFrequency",
		"Canon:SensorRedLevel",
		"Canon:SensorBlueLevel",
		"Canon:WhiteBalanceRed",
		"Canon:WhiteBalanceBlue",
		"Canon:ColorTemperature",
		"Canon:PictureStyle",
		"Canon:DigitalGain",
		"Canon:WBShiftAB",
		"Canon:WBShiftGM",
		"Canon:UnsharpMaskFineness",
		"Canon:UnsharpMaskThreshold",
		"Canon:MeasuredRGGB",
		"Canon:ColorSpace",
		"Canon:VRDOffset",
		"Canon:SensorWidth",
		"Canon:SensorHeight",
		"Canon:SensorLeftBorder",
		"Canon:SensorTopBorder",
		"Canon:SensorRightBorder",
		"Canon:SensorBottomBorder",
		"Canon:BlackMaskLeftBorder",
		"Canon:BlackMaskTopBorder",
		"Canon:BlackMaskRightBorder",
		"Canon:BlackMaskBottomBorder",
		"Canon:PictureStyleUserDef",
		"Canon:PictureStylePC",
		"Canon:CustomPictureStyleFileName",
		"Canon:AFMicroAdjMode",
		"Canon:AFMicroAdjValue",
		"Canon:PeripheralLightingSetting",
		"Canon:ChromaticAberrationSetting",
		"Canon:DistortionCorrectionSetting",
		"Canon:DigitalLensOptimizerSetting",
		"Canon:PeripheralIlluminationCorr",
		"Canon:AutoLightingOptimizer",
		"Canon:HighlightTonePriority",
		"Canon:LongExposureNoiseReduction",
		"Canon:HighISONoiseReduction",
		"Canon:DigitalLensOptimizer",
		"Canon:DualPixelRaw",
		"Canon:AmbienceSelection",
		"Canon:GrainyBWFilter",
		"Canon:SoftFocusFilter",
		"Canon:ToyCameraFilter",
		"Canon:MiniatureFilter",
		"Canon:MiniatureFilterOrientation",
		"Canon:MiniatureFilterPosition",
		"Canon:MiniatureFilterParameter",
		"Canon:FisheyeFilter",
		"Canon:PaintingFilter",
		"Canon:WatercolorFilter",
		"Canon:HDR",
		"Canon:HDREffect",
		"Canon:ThumbnailImage",
		"IFD0:ImageWidth",
		"IFD0:ImageHeight",
		"IFD0:BitsPerSample",
		"IFD0:Compression",
		"IFD0:Make",
		"IFD0:Model",
		"IFD0:Orientation",
		"IFD0:XResolution",
		"IFD0:YResolution",
		"IFD0:ResolutionUnit",
		"ExifIFD:ExposureTime",
		"ExifIFD:FNumber",
		"ExifIFD:ExposureProgram",
		"ExifIFD:ISO",
		"ExifIFD:SensitivityType",
		"ExifIFD:RecommendedExposureIndex",
		"ExifIFD:ExifVersion",
		"ExifIFD:ComponentsConfiguration",
		"ExifIFD:ShutterSpeedValue",
		"ExifIFD:ApertureValue",
		"ExifIFD:ExposureCompensation",
		"ExifIFD:MeteringMode",
		"ExifIFD:Flash",
		"ExifIFD:FocalLength",
		"ExifIFD:FlashpixVersion",
		"ExifIFD:ColorSpace",
		"ExifIFD:ExifImageWidth",
		"ExifIFD:ExifImageHeight",
		"ExifIFD:FocalPlaneXResolution",
		"ExifIFD:FocalPlaneYResolution",
		"ExifIFD:FocalPlaneResolutionUnit",
		"ExifIFD:CustomRendered",
		"ExifIFD:ExposureMode",
		"ExifIFD:WhiteBalance",
		"ExifIFD:SceneCaptureType",
		"ExifIFD:LensInfo",
		"ExifIFD:LensModel",
		"CanonCustom:ISOExpansion",
		"CanonCustom:SafetyShift",
		"CanonCustom:ShutterReleaseWithoutLens",
		"CanonCustom:RetractLensOnPowerOff",
		"CanonCustom:CustomControls",
		"Track1:TrackHeaderVersion",
		"Track1:TrackCreateDate",
		"Track1:TrackModifyDate",
		"Track1:TrackID",
		"Track1:TrackDuration",
		"Track1:TrackLayer",
		"Track1:TrackVolume",
		"Track1:MatrixStructure",
		"Track1:ImageWidth",
		"Track1:ImageHeight",
		"Track1:MediaHeaderVersion",
		"Track1:MediaCreateDate",
		"Track1:MediaModifyDate",
		"Track1:MediaTimeScale",
		"Track1:MediaDuration",
		"Track1:MediaLanguageCode",
		"Track1:HandlerType",
		"Track1:GraphicsMode",
		"Track1:OpColor",
		"Track1:CompressorID",
		"Track1:SourceImageWidth",
		"Track1:SourceImageHeight",
		"Track1:XResolution",
		"Track1:YResolution",
		"Track1:BitDepth",
		"Track1:VideoFrameRate",
		"Doc1:Track1:SampleTime",
		"Doc1:Track1:SampleDuration",
		"Doc1:Track1:JpgFromRaw",
		"Track2:TrackHeaderVersion",
		"Track2:TrackCreateDate",
		"Track2:TrackModifyDate",
		"Track2:TrackID",
		"Track2:TrackDuration",
		"Track2:TrackLayer",
		"Track2:TrackVolume",
		"Track2:MatrixStructure",
		"Track2:ImageWidth",
		"Track2:ImageHeight",
		"Track2:MediaHeaderVersion",
		"Track2:MediaCreateDate",
		"Track2:MediaModifyDate",
		"Track2:MediaTimeScale",
		"Track2:MediaDuration",
		"Track2:MediaLanguageCode",
		"Track2:HandlerType",
		"Track2:GraphicsMode",
		"Track2:OpColor",
		"Track2:CompressorID",
		"Track2:SourceImageWidth",
		"Track2:SourceImageHeight",
		"Track2:XResolution",
		"Track2:YResolution",
		"Track2:BitDepth",
		"Track2:ImageWidth",
		"Track2:ImageHeight",
		"Track2:VideoFrameRate",
		"Track3:TrackHeaderVersion",
		"Track3:TrackCreateDate",
		"Track3:TrackModifyDate",
		"Track3:TrackID",
		"Track3:TrackDuration",
		"Track3:TrackLayer",
		"Track3:TrackVolume",
		"Track3:MatrixStructure",
		"Track3:ImageWidth",
		"Track3:ImageHeight",
		"Track3:MediaHeaderVersion",
		"Track3:MediaCreateDate",
		"Track3:MediaModifyDate",
		"Track3:MediaTimeScale",
		"Track3:MediaDuration",
		"Track3:MediaLanguageCode",
		"Track3:HandlerType",
		"Track3:GraphicsMode",
		"Track3:OpColor",
		"Track3:CompressorID",
		"Track3:SourceImageWidth",
		"Track3:SourceImageHeight",
		"Track3:XResolution",
		"Track3:YResolution",
		"Track3:BitDepth",
		"Track3:ImageWidth",
		"Track3:ImageHeight",
		"Track3:VideoFrameRate",
		"Track4:TrackHeaderVersion",
		"Track4:TrackCreateDate",
		"Track4:TrackModifyDate",
		"Track4:TrackID",
		"Track4:TrackDuration",
		"Track4:TrackLayer",
		"Track4:TrackVolume",
		"Track4:MatrixStructure",
		"Track4:MediaHeaderVersion",
		"Track4:MediaCreateDate",
		"Track4:MediaModifyDate",
		"Track4:MediaTimeScale",
		"Track4:MediaDuration",
		"Track4:MediaLanguageCode",
		"Track4:HandlerType",
		"Track4:MetaFormat",
		"Doc2:Track4:SampleTime",
		"Doc2:Track4:SampleDuration",
		"Doc2:Track4:TimeStamp",
		"Doc2:Track4:FocalLength",
		"Doc2:Track4:FNumber",
		"Doc2:Track4:ExposureTime",
		"Doc2:Track4:ISO",
		"Doc2:Track4:ExifByteOrder",
		"Doc2:Track4:MacroMode",
		"Doc2:Track4:SelfTimer",
		"Doc2:Track4:Quality",
		"Doc2:Track4:CanonFlashMode",
		"Doc2:Track4:ContinuousDrive",
		"Doc2:Track4:FocusMode",
		"Doc2:Track4:RecordMode",
		"Doc2:Track4:CanonImageSize",
		"Doc2:Track4:EasyMode",
		"Doc2:Track4:DigitalZoom",
		"Doc2:Track4:Contrast",
		"Doc2:Track4:Saturation",
		"Doc2:Track4:CameraISO",
		"Doc2:Track4:MeteringMode",
		"Doc2:Track4:FocusRange",
		"Doc2:Track4:CanonExposureMode",
		"Doc2:Track4:LensType",
		"Doc2:Track4:MaxFocalLength",
		"Doc2:Track4:MinFocalLength",
		"Doc2:Track4:FocalUnits",
		"Doc2:Track4:MaxAperture",
		"Doc2:Track4:MinAperture",
		"Doc2:Track4:FlashModel",
		"Doc2:Track4:FlashBits",
		"Doc2:Track4:ZoomSourceWidth",
		"Doc2:Track4:ZoomTargetWidth",
		"Doc2:Track4:ManualFlashOutput",
		"Doc2:Track4:ColorTone",
		"Doc2:Track4:SRAWQuality",
		"Doc2:Track4:AutoISO",
		"Doc2:Track4:BaseISO",
		"Doc2:Track4:MeasuredEV",
		"Doc2:Track4:TargetAperture",
		"Doc2:Track4:TargetExposureTime",
		"Doc2:Track4:ExposureCompensation",
		"Doc2:Track4:WhiteBalance",
		"Doc2:Track4:SlowShutter",
		"Doc2:Track4:SequenceNumber",
		"Doc2:Track4:OpticalZoomCode",
		"Doc2:Track4:CameraTemperature",
		"Doc2:Track4:FlashGuideNumber",
		"Doc2:Track4:FlashExposureComp",
		"Doc2:Track4:AutoExposureBracketing",
		"Doc2:Track4:AEBBracketValue",
		"Doc2:Track4:ControlMode",
		"Doc2:Track4:FNumber",
		"Doc2:Track4:ExposureTime",
		"Doc2:Track4:MeasuredEV2",
		"Doc2:Track4:BulbDuration",
		"Doc2:Track4:CameraType",
		"Doc2:Track4:AutoRotate",
		"Doc2:Track4:NDFilter",
		"Doc2:Track4:AFAreaMode",
		"Doc2:Track4:NumAFPoints",
		"Doc2:Track4:ValidAFPoints",
		"Doc2:Track4:CanonImageWidth",
		"Doc2:Track4:CanonImageHeight",
		"Doc2:Track4:AFImageWidth",
		"Doc2:Track4:AFImageHeight",
		"Doc2:Track4:AFAreaWidths",
		"Doc2:Track4:AFAreaHeights",
		"Doc2:Track4:AFAreaXPositions",
		"Doc2:Track4:AFAreaYPositions",
		"Doc2:Track4:AFPointsInFocus",
		"Doc2:Track4:AFPointsSelected",
		"Doc2:Track4:BracketMode",
		"Doc2:Track4:BracketValue",
		"Doc2:Track4:BracketShotNumber",
		"Doc2:Track4:RawJpgSize",
		"Doc2:Track4:WBBracketMode",
		"Doc2:Track4:WBBracketValueAB",
		"Doc2:Track4:WBBracketValueGM",
		"Doc2:Track4:LiveViewShooting",
		"Doc2:Track4:FocusDistanceUpper",
		"Doc2:Track4:FocusDistanceLower",
		"Doc2:Track4:ShutterMode",
		"Doc2:Track4:FlashExposureLock",
		"Doc2:Track4:AntiFlicker",
		"Doc2:Track4:RFLensType",
		"Doc2:Track4:ToneCurve",
		"Doc2:Track4:Sharpness",
		"Doc2:Track4:SharpnessFrequency",
		"Doc2:Track4:SensorRedLevel",
		"Doc2:Track4:SensorBlueLevel",
		"Doc2:Track4:WhiteBalanceRed",
		"Doc2:Track4:WhiteBalanceBlue",
		"Doc2:Track4:ColorTemperature",
		"Doc2:Track4:PictureStyle",
		"Doc2:Track4:DigitalGain",
		"Doc2:Track4:WBShiftAB",
		"Doc2:Track4:WBShiftGM",
		"Doc2:Track4:UnsharpMaskFineness",
		"Doc2:Track4:UnsharpMaskThreshold",
		"Doc2:Track4:PeripheralLightingSetting",
		"Doc2:Track4:ChromaticAberrationSetting",
		"Doc2:Track4:DistortionCorrectionSetting",
		"Doc2:Track4:DigitalLensOptimizerSetting",
		"Doc2:Track4:ColorDataVersion",
		"Doc2:Track4:WB_RGGBLevelsAsShot",
		"Doc2:Track4:ColorTempAsShot",
		"Doc2:Track4:WB_RGGBLevelsAuto",
		"Doc2:Track4:ColorTempAuto",
		"Doc2:Track4:WB_RGGBLevelsMeasured",
		"Doc2:Track4:ColorTempMeasured",
		"Doc2:Track4:WB_RGGBLevelsDaylight",
		"Doc2:Track4:ColorTempDaylight",
		"Doc2:Track4:WB_RGGBLevelsShade",
		"Doc2:Track4:ColorTempShade",
		"Doc2:Track4:WB_RGGBLevelsCloudy",
		"Doc2:Track4:ColorTempCloudy",
		"Doc2:Track4:WB_RGGBLevelsTungsten",
		"Doc2:Track4:ColorTempTungsten",
		"Doc2:Track4:WB_RGGBLevelsFluorescent",
		"Doc2:Track4:ColorTempFluorescent",
		"Doc2:Track4:WB_RGGBLevelsKelvin",
		"Doc2:Track4:ColorTempKelvin",
		"Doc2:Track4:WB_RGGBLevelsFlash",
		"Doc2:Track4:ColorTempFlash",
		"Doc2:Track4:PerChannelBlackLevel",
		"Doc2:Track4:NormalWhiteLevel",
		"Doc2:Track4:SpecularWhiteLevel",
		"Doc2:Track4:LinearityUpperMargin",
		"Doc2:Track4:FirmwareVersion",
		"Doc2:Track4:VignettingCorrVersion",
		"Doc2:ExifIFD:SceneCaptureType",
		"XMP-x:XMPToolkit",
		"XMP-tiff:Orientation",
		"Composite:ConditionalFEC",
		"Composite:DriveMode",
		"Composite:FlashType",
		"Composite:ISO",
		"Composite:Lens",
		"Composite:RedEyeReduction",
		"Composite:ShootingMode",
		"Composite:ShutterCurtainHack",
		"Composite:WB_RGGBLevels",
		"Composite:Aperture",
		"Composite:BlueBalance",
		"Composite:ImageSize",
		"Composite:LensID",
		"Composite:Megapixels",
		"Composite:RedBalance",
		"Composite:ScaleFactor35efl",
		"Composite:ShutterSpeed",
		"Composite:AvgBitrate",
		"Composite:Rotation",
		"Composite:Lens35efl",
		"Composite:CircleOfConfusion",
		"Composite:DOF",
		"Composite:FOV",
		"Composite:FocalLength35efl",
		"Composite:HyperfocalDistance",
		"Composite:LightValue",
	],
	"Panasonic.rw2": [
		"ExifTool:ExifToolVersion",
		"File:FileType",
		"File:FileTypeExtension",
		"File:MIMEType",
		"File:ExifByteOrder",
		"IFD0:PanasonicRawVersion",
		"IFD0:SensorWidth",
		"IFD0:SensorHeight",
		"IFD0:SensorTopBorder",
		"IFD0:SensorLeftBorder",
		"IFD0:SensorBottomBorder",
		"IFD0:SensorRightBorder",
		"IFD0:SamplesPerPixel",
		"IFD0:CFAPattern",
		"IFD0:BitsPerSample",
		"IFD0:Compression",
		"IFD0:LinearityLimitRed",
		"IFD0:LinearityLimitGreen",
		"IFD0:LinearityLimitBlue",
		"IFD0:ISO",
		"IFD0:HighISOMultiplierRed",
		"IFD0:HighISOMultiplierGreen",
		"IFD0:HighISOMultiplierBlue",
		"IFD0:NoiseReductionParams",
		"IFD0:BlackLevelRed",
		"IFD0:BlackLevelGreen",
		"IFD0:BlackLevelBlue",
		"IFD0:WBRedLevel",
		"IFD0:WBGreenLevel",
		"IFD0:WBBlueLevel",
		"IFD0:RawFormat",
		"IFD0:JpgFromRaw",
		"IFD0:Make",
		"IFD0:Model",
		"IFD0:StripOffsets",
		"IFD0:Orientation",
		"IFD0:RowsPerStrip",
		"IFD0:StripByteCounts",
		"IFD0:RawDataOffset",
		"PanasonicRaw:NumWBEntries",
		"PanasonicRaw:WBType1",
		"PanasonicRaw:WB_RGBLevels1",
		"PanasonicRaw:WBType2",
		"PanasonicRaw:WB_RGBLevels2",
		"PanasonicRaw:WBType3",
		"PanasonicRaw:WB_RGBLevels3",
		"PanasonicRaw:WBType4",
		"PanasonicRaw:WB_RGBLevels4",
		"PanasonicRaw:WBType5",
		"PanasonicRaw:WB_RGBLevels5",
		"PanasonicRaw:WBType6",
		"PanasonicRaw:WB_RGBLevels6",
		"PanasonicRaw:WBType7",
		"PanasonicRaw:WB_RGBLevels7",
		"PanasonicRaw:DistortionParam02",
		"PanasonicRaw:DistortionParam04",
		"PanasonicRaw:DistortionScale",
		"PanasonicRaw:DistortionCorrection",
		"PanasonicRaw:DistortionParam08",
		"PanasonicRaw:DistortionParam09",
		"PanasonicRaw:DistortionParam11",
		"Doc1:File:ExifByteOrder",
		"Doc1:File:ImageWidth",
		"Doc1:File:ImageHeight",
		"Doc1:File:EncodingProcess",
		"Doc1:File:BitsPerSample",
		"Doc1:File:ColorComponents",
		"Doc1:File:YCbCrSubSampling",
		"Doc1:IFD0:Orientation",
		"Doc1:IFD0:XResolution",
		"Doc1:IFD0:YResolution",
		"Doc1:IFD0:ResolutionUnit",
		"Doc1:IFD0:YCbCrPositioning",
		"ExifIFD:ExposureTime",
		"ExifIFD:FNumber",
		"ExifIFD:ExposureProgram",
		"ExifIFD:ExifVersion",
		"ExifIFD:ExposureCompensation",
		"ExifIFD:MaxApertureValue",
		"ExifIFD:MeteringMode",
		"ExifIFD:Flash",
		"ExifIFD:FocalLength",
		"ExifIFD:FileSource",
		"Composite:Aperture",
		"Composite:BlueBalance",
		"Composite:RedBalance",
		"Composite:ShutterSpeed",
		"Composite:ImageHeight",
		"Composite:ImageWidth",
		"Composite:ImageSize",
		"Composite:LightValue",
		"Composite:Megapixels",
		"Composite:FocalLength35efl",
	],
};

describe("RAW ON-output pin (FID-04, D-35)", () => {
	const temporaryDirs: string[] = [];

	afterEach(() => {
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	for (const raw of RAW_CASES) {
		it(`the product adapter's default-ON output key list on ${raw.fixture} equals the pinned literal exactly, and its resolution values equal 300/300/2 (D-35)`, async () => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), "raw-on-pin-"));
			temporaryDirs.push(dir);
			const source = path.join(dir, raw.fixture);
			fs.copyFileSync(path.join(FIXTURES_DIR, raw.fixture), source);
			seedFile(
				source,
				EXIFTOOL_PATH,
				RAW_RESOLUTION_SEED_ARGS,
				resolutionSeedExpect(raw.fixture),
			);
			const destination = path.join(dir, `${raw.fixture}.on`);
			const before = snapshotDir(dir);

			const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
			const adapter = new ExifToolAdapter({ process });
			await process.open();
			try {
				const result = await adapter.sanitize({
					source,
					destination,
					outputMode: "copy",
					preserveOrientation: true,
					preserveColorProfile: true,
					preserveResolution: true,
					preserveTimestamps: false,
				});
				expect(result).toEqual({ ok: true, value: undefined });
			} finally {
				await process.close();
			}

			const after = snapshotDir(dir);
			assertDirEffect(before, after, {
				added: [path.basename(destination)],
				modified: [],
				removed: [],
				unchanged: [raw.fixture],
			});

			const lines = readRawTagLines(destination, EXIFTOOL_PATH);
			const pinned = PINNED_ON_OUTPUT_KEYS[raw.fixture];
			if (pinned === undefined) {
				throw new Error(
					`No PINNED_ON_OUTPUT_KEYS entry for fixture ${raw.fixture}`,
				);
			}
			expect(lines.map((line) => line.key)).toEqual(pinned);

			const prefix = resolutionGroupPrefix(raw.fixture);
			const resolutionKeys = [
				`${prefix}:XResolution`,
				`${prefix}:YResolution`,
				`${prefix}:ResolutionUnit`,
			];
			const resolutionLines = lines
				.filter((line) => resolutionKeys.includes(line.key))
				.map((line) => `${line.key} : ${line.value}`)
				.sort();
			expect(resolutionLines).toEqual(
				[
					`${prefix}:XResolution : 300`,
					`${prefix}:YResolution : 300`,
					`${prefix}:ResolutionUnit : 2`,
				].sort(),
			);
		});
	}
});

describe("RAW ON versus OFF on seeded input (FID-04, D-35)", () => {
	const temporaryDirs: string[] = [];

	afterEach(() => {
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	for (const raw of RAW_CASES) {
		const isRw2 = raw.fixture === "Panasonic.rw2";

		it(`ON minus OFF on ${raw.fixture} matches what the real app measured (FID-04, D-35)`, async () => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), "raw-on-off-"));
			temporaryDirs.push(dir);
			const onSource = path.join(dir, `on_${raw.fixture}`);
			fs.copyFileSync(path.join(FIXTURES_DIR, raw.fixture), onSource);
			const expected = resolutionSeedExpect(raw.fixture);
			seedFile(onSource, EXIFTOOL_PATH, RAW_RESOLUTION_SEED_ARGS, expected);
			const offSource = path.join(dir, `off_${raw.fixture}`);
			fs.copyFileSync(onSource, offSource);

			const onDestination = path.join(dir, `${raw.fixture}.on`);
			const offDestination = path.join(dir, `${raw.fixture}.off`);

			const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
			const adapter = new ExifToolAdapter({ process });
			await process.open();
			try {
				const onResult = await adapter.sanitize({
					source: onSource,
					destination: onDestination,
					outputMode: "copy",
					preserveOrientation: true,
					preserveColorProfile: true,
					preserveResolution: true,
					preserveTimestamps: false,
				});
				expect(onResult).toEqual({ ok: true, value: undefined });
				const offResult = await adapter.sanitize({
					source: offSource,
					destination: offDestination,
					outputMode: "copy",
					preserveOrientation: true,
					preserveColorProfile: true,
					preserveResolution: false,
					preserveTimestamps: false,
				});
				expect(offResult).toEqual({ ok: true, value: undefined });
			} finally {
				await process.close();
			}

			const onLines = readRawTagLines(onDestination, EXIFTOOL_PATH);
			const offLines = readRawTagLines(offDestination, EXIFTOOL_PATH);
			const diff = tagLineDifferential(offLines, onLines);

			if (isRw2) {
				expect([...diff.added].sort()).toEqual(
					[
						"Doc1:IFD0:ResolutionUnit",
						"Doc1:IFD0:XResolution",
						"Doc1:IFD0:YResolution",
					].sort(),
				);
				expect(diff.removed).toEqual([]);
				expect(diff.changed.map((c) => c.key)).toEqual(["IFD0:JpgFromRaw"]);
			} else {
				expect(diff).toEqual({ removed: [], added: [], changed: [] });
			}
		});
	}
});

// Oracle negative control: builds the input argument list from the product'"'"'s own RAW branch
// constants (-all=, RAW_IDENTIFYING_TAG_DELETES, QUICKTIME_DATE_REMOVAL_ARGS, -TagsFromFile, @,
// -Orientation, -ICC_Profile, RESOLUTION_PRESERVE_ARGS), plus one injected token, plus -o and
// the source -- mirroring exiftool_adapter.ts's sanitize() argument order exactly. The OFF
// baseline is built the same way, without RESOLUTION_PRESERVE_ARGS, matching
// resolution_negative_control.test.ts's own oracle-negative-control style. Expectations are
// hand-written violation strings, measured 2026-09-23.
describe("RAW resolution oracle negative control (D-35)", () => {
	const temporaryDirs: string[] = [];

	afterEach(() => {
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	function buildOffArgs(source: string, out: string): string[] {
		return [
			"-all=",
			...RAW_IDENTIFYING_TAG_DELETES,
			...QUICKTIME_DATE_REMOVAL_ARGS,
			"-TagsFromFile",
			"@",
			"-Orientation",
			"-ICC_Profile",
			"-o",
			out,
			source,
		];
	}

	function buildOnArgsWithInjection(
		injected: string,
		source: string,
		out: string,
	): string[] {
		return [
			"-all=",
			...RAW_IDENTIFYING_TAG_DELETES,
			...QUICKTIME_DATE_REMOVAL_ARGS,
			"-TagsFromFile",
			"@",
			"-Orientation",
			"-ICC_Profile",
			...RESOLUTION_PRESERVE_ARGS,
			injected,
			"-o",
			out,
			source,
		];
	}

	for (const raw of RAW_CASES) {
		const isRw2 = raw.fixture === "Panasonic.rw2";
		const artistKey = isRw2 ? "Doc1:IFD0:Artist" : "IFD0:Artist";

		it(`an injected -IFD0:Artist copy-back is caught as an unrequested/changed key on ${raw.fixture} (D-35)`, () => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), "raw-oracle-"));
			temporaryDirs.push(dir);
			const seeded = path.join(dir, `seed_${raw.fixture}`);
			fs.copyFileSync(path.join(FIXTURES_DIR, raw.fixture), seeded);
			seedFile(
				seeded,
				EXIFTOOL_PATH,
				RAW_RESOLUTION_SEED_ARGS,
				resolutionSeedExpect(raw.fixture),
			);
			const sourceLines = readRawTagLines(seeded, EXIFTOOL_PATH);

			const offSrc = path.join(dir, `off_src_${raw.fixture}`);
			fs.copyFileSync(seeded, offSrc);
			const offOut = path.join(dir, `off_out_${raw.fixture}`);
			execFileSync(EXIFTOOL_PATH, buildOffArgs(offSrc, offOut));

			const onSrc = path.join(dir, `artist_src_${raw.fixture}`);
			fs.copyFileSync(seeded, onSrc);
			const onOut = path.join(dir, `artist_out_${raw.fixture}`);
			execFileSync(
				EXIFTOOL_PATH,
				buildOnArgsWithInjection("-IFD0:Artist>IFD0:Artist", onSrc, onOut),
			);

			const offLines = readRawTagLines(offOut, EXIFTOOL_PATH);
			const onLines = readRawTagLines(onOut, EXIFTOOL_PATH);
			const violations = resolutionDeltaViolations({
				source: sourceLines,
				off: offLines,
				on: onLines,
				companions: isRw2 ? ["IFD0:JpgFromRaw"] : [],
			});
			expect(
				violations.some(
					(v) =>
						v === `unrequested:${artistKey}` || v === `changed:${artistKey}`,
				),
			).toBe(true);
		});

		it(`relocating -IFD0:XResolution into XMP-tiff is caught as a synthesized key on ${raw.fixture} (D-35)`, () => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), "raw-oracle-"));
			temporaryDirs.push(dir);
			const seeded = path.join(dir, `seed_${raw.fixture}`);
			fs.copyFileSync(path.join(FIXTURES_DIR, raw.fixture), seeded);
			seedFile(
				seeded,
				EXIFTOOL_PATH,
				RAW_RESOLUTION_SEED_ARGS,
				resolutionSeedExpect(raw.fixture),
			);
			const sourceLines = readRawTagLines(seeded, EXIFTOOL_PATH);

			const offSrc = path.join(dir, `off_src2_${raw.fixture}`);
			fs.copyFileSync(seeded, offSrc);
			const offOut = path.join(dir, `off_out2_${raw.fixture}`);
			execFileSync(EXIFTOOL_PATH, buildOffArgs(offSrc, offOut));

			const onSrc = path.join(dir, `xmp_src_${raw.fixture}`);
			fs.copyFileSync(seeded, onSrc);
			const onOut = path.join(dir, `xmp_out_${raw.fixture}`);
			execFileSync(
				EXIFTOOL_PATH,
				buildOnArgsWithInjection(
					"-IFD0:XResolution>XMP-tiff:XResolution",
					onSrc,
					onOut,
				),
			);

			const offLines = readRawTagLines(offOut, EXIFTOOL_PATH);
			const onLines = readRawTagLines(onOut, EXIFTOOL_PATH);
			const violations = resolutionDeltaViolations({
				source: sourceLines,
				off: offLines,
				on: onLines,
				companions: isRw2 ? ["IFD0:JpgFromRaw"] : [],
			});
			expect(violations).toContain("synthesized:XMP-tiff:XResolution");
		});
	}
});
