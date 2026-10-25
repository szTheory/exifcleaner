// Single module graph for scripts/measure_copy_mode_batch_cost.mjs. tsx's tsImport() gives every
// call its own random namespace (its own copy of every module it loads), so the registry seam in
// exifcleaner-node can only affect the NativeMetadataAdapter loaded in the SAME tsImport call.
// This file is loaded by one tsImport and re-exports the app classes together with that graph's
// registry module. The package exports map exposes only ".", hence the relative path.
export { ExiftoolProcess } from "../src/infrastructure/exiftool/ExiftoolProcess.ts";
export { ExifToolAdapter } from "../src/infrastructure/exiftool/exiftool_adapter.ts";
export { NativeMetadataAdapter } from "../src/infrastructure/metadata/native_metadata_adapter.ts";
export { HybridMetadataEngine } from "../src/infrastructure/metadata/hybrid_metadata_engine.ts";
export { StripMetadataCommand } from "../src/application/commands/strip_metadata_command.ts";
export { VerifyGeneratedOutputQuery } from "../src/application/queries/verify_generated_output_query.ts";
export { OutputTransaction } from "../src/main/output_transaction.ts";
export { seedHeifCopy } from "../tests/helpers/heif_seed.ts";
export * as registry from "../node_modules/exifcleaner-node/dist/admission/registry.js";
