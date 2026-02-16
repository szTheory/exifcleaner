# TypeScript Conventions for ExifCleaner

**Last updated**: February 15, 2026
**Aligns with**: Phase 6 DDD Architecture Refactor

This document codifies TypeScript best practices for ExifCleaner. It complements [CLAUDE.md](../../CLAUDE.md) with type-specific rules optimized for LLM consumption.

---

## Quick Reference

**Critical rules** (enforce these first):

- Use `strict: true` + additional safety flags (noUncheckedIndexedAccess, exactOptionalPropertyTypes)
- Never introduce `any` — use `unknown` for boundaries, `Record<string, unknown>` for truly dynamic data
- Prefer `undefined` over `null` for absence
- Use named arguments (single object parameter) for non-trivial functions
- Add explicit return type annotations on all exported functions
- Export return types (`ReturnType<typeof fn>`), keep param types inline (duck typing)
- Use Error objects, not string throws
- Convert `unknown` via type guards, never via `as` assertions
- Add comments for meaning (invariants, business rules), not for restating types
- Use discriminated unions + `never` checks for exhaustive switch handling

---

## Configuration Best Practices

### Current State

ExifCleaner's `tsconfig.json` currently enables:
```json
{
  "strict": true,                          // ✅ All strictness checks
  "verbatimModuleSyntax": true,            // ✅ Enforces type-only imports
  "forceConsistentCasingInFileNames": true, // ✅ Prevents case bugs
  "skipLibCheck": true                     // ✅ Faster builds
}
```

### Recommended Additions

Add these flags incrementally to catch more bugs at compile time:

```json
{
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noPropertyAccessFromIndexSignature": true,
  "useUnknownInCatchVariables": true,
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true
}
```

**Rationale**:

| Flag | Bug Class Prevented | Example |
|------|---------------------|---------|
| `noUncheckedIndexedAccess` | Prevents unsafe array/object access | `result.data[0]` returns `T \| undefined`, forces bounds check |
| `exactOptionalPropertyTypes` | Distinguishes absent from `undefined` | `prop?: T` means "absent or T", not "`T \| undefined`" |
| `noPropertyAccessFromIndexSignature` | Prevents unsafe property access | Requires `obj["key"]` for index signatures, not `obj.key` |
| `useUnknownInCatchVariables` | Catch blocks are `unknown`, not `any` | Forces type narrowing before using error properties |
| `noImplicitReturns` | All code paths must return | Catches missing returns in conditional branches |
| `noFallthroughCasesInSwitch` | Prevents accidental switch fallthrough | Each case must `break`, `return`, or `throw` |

**Action**: Enable these flags incrementally. When errors appear, fix them properly (don't disable the flag).

---

## Type Safety Rules

### Null and Undefined

**House rules for absence**:

- **Prefer `undefined` over `null`** for representing absence
  - Exception: When boundary forces `null` (e.g., JSON APIs, DOM APIs)
  - Rationale: `undefined` is JavaScript's natural "absence" value

- **Optional properties mean absent OR present**
  - With `exactOptionalPropertyTypes`, `prop?: T` means either absent or `T` when present
  - Do NOT assign `undefined` unless the type explicitly includes it: `prop?: T | undefined`
  - Why: Distinguishes `"key" in obj` (absent) from `obj.key === undefined` (present but undefined)

- **Handle indexed access safely**
  - With `noUncheckedIndexedAccess`, `array[0]` and `obj[key]` return `T | undefined`
  - Always check for `undefined` before use

```typescript
// ❌ BAD: Current anti-pattern in exif_handlers.ts:27
return cleanExifData(result.data[0]);  // No bounds check

// ✅ GOOD: Explicit undefined handling
const firstItem = result.data[0];
if (firstItem === undefined) {
  return {};
}
return cleanExifData(firstItem);
```

- **Avoid non-null assertions (`!`)**
  - Only use in constrained glue code where invariant is guaranteed
  - Always add a comment explaining the invariant

```typescript
// ✅ ACCEPTABLE: Non-null assertion with explanation
// Safe: process and stdin guaranteed non-null after sendCommand validation
this.process!.stdin!.write(command + "\n");
```

- **Don't use truthiness for type narrowing**
  - `if (value)` treats `0`, `""`, and `false` as absent
  - Use explicit checks: `value !== undefined`, `value !== null`, `value != null` (both null and undefined)

```typescript
// ❌ BAD: Truthiness check fails for empty string
if (filePath) {  // Empty string is falsy but might be valid
  processFile(filePath);
}

// ✅ GOOD: Explicit undefined check
if (filePath !== undefined) {
  processFile(filePath);
}
```

---

### any, unknown, and Boundary Validation

**House rule**: Never introduce `any`. Use `unknown` for untrusted inputs at boundaries.

**Exception**: `Record<string, unknown>` is allowed for truly dynamic data (e.g., ExifTool metadata that varies by file type).

**Current good pattern** (already in codebase):
```typescript
// api_types.ts - ExifTool output is inherently dynamic
export interface ExifData {
  [key: string]: unknown;  // ✅ Bounded "any" for dynamic metadata
}
```

**Anti-pattern found** (fix during refactoring):
```typescript
// ❌ BAD: table_update_row.ts lines 5 and 37
export function updateRowWithExif(
  tdNode: HTMLTableCellElement,
  exifData: any,  // Unbounded any
): void {

// ✅ GOOD: Use typed interface
import type { ExifData } from "../preload/api_types";
export function updateRowWithExif(
  tdNode: HTMLTableCellElement,
  exifData: ExifData,  // Properly typed
): void {
```

**Convert `unknown` via type guards, not assertions**:

```typescript
// ❌ BAD: Type assertions don't add runtime checks
const data = jsonResponse as MyType;  // Fails silently if wrong shape

// ✅ GOOD: User-defined type guard with runtime check
function isMyType(value: unknown): value is MyType {
  return (
    typeof value === "object" &&
    value !== null &&
    "requiredField" in value &&
    typeof (value as Record<string, unknown>).requiredField === "string"
  );
}

if (isMyType(jsonResponse)) {
  // TypeScript knows jsonResponse is MyType here
  console.log(jsonResponse.requiredField);  // Type-safe access
}
```

**Catch blocks should use `unknown`**:

With `useUnknownInCatchVariables`:
```typescript
try {
  await riskyOperation();
} catch (err: unknown) {  // Explicit unknown (or implicit with flag)
  if (err instanceof Error) {
    console.error(err.message);  // Type-safe after narrowing
  } else {
    console.error(String(err));  // Fallback for non-Error throws
  }
}
```

---

### Return Types and Exports

**Rule**: For exported functions and public class methods, add explicit return type annotations.

**Current good pattern** (already followed):
```typescript
// ExiftoolProcess.ts - Explicit return types on all public methods
async open(): Promise<number> {
  // ...
}

async close(): Promise<ExifToolCloseResult> {
  // ...
}
```

**Export named return types** using `ReturnType<typeof fn>`:

```typescript
export const makeCommand = () => ({
  async execute(): Promise<{ ok: true } | { ok: false; error: string }> {
    // ...
  }
});

// Export derived types for consumers
export type Command = ReturnType<typeof makeCommand>;
export type CommandResult = ReturnType<Command["execute"]>;
```

**Caveat**: For overloaded functions, `ReturnType` uses the last signature. Prefer single-signature exported functions unless overloads provide real clarity.

**Do NOT export parameter types by default** — keep arg shapes inline or file-local:

```typescript
// ✅ GOOD: Inline parameter type (duck typing)
export function processFile({
  filePath,
  dryRun = false,
}: {
  filePath: string;
  dryRun?: boolean;
}): ProcessResult {
  // Parameter type not exported, but call sites get full type info via contextual typing
}

// ❌ AVOID: Exporting parameter interface (nominal coupling)
export interface ProcessFileParams {
  filePath: string;
  dryRun?: boolean;
}

export function processFile(params: ProcessFileParams): ProcessResult {
  // Now consumers must import ProcessFileParams, breaking duck typing
}
```

**Why inline types**: Enables structural typing (duck typing). Consumers can pass any object with the required shape without importing an interface.

---

### Index Access and Array Safety

**With `noUncheckedIndexedAccess`, handle possibly-undefined results**:

```typescript
// ❌ BAD: Assumes array has elements
const firstMetadata = metadataArray[0];
firstMetadata.FileName;  // Might be undefined!

// ✅ GOOD: Handle undefined explicitly
const firstMetadata = metadataArray[0];
if (firstMetadata === undefined) {
  throw new Error("Expected at least one metadata entry");
}
console.log(firstMetadata.FileName);  // Type-safe
```

**For dictionary-like objects**:

```typescript
// With noPropertyAccessFromIndexSignature:
const value = obj[key];  // ✅ OK: Bracket notation
const value2 = obj.key;  // ❌ Error: Use bracket notation for index signatures

// This prevents:
const wrongKey = obj.typoKey;  // Would silently be undefined without the flag
```

---

## API Design Patterns

### Named Arguments (Single Object Parameter)

**Rule**: Use named arguments (a single object parameter) for all non-trivial functions.

**Pattern**:
```typescript
// ✅ GOOD: Named arguments with inline types
export const makeExiftoolAdapter = ({
  binPath,
  logger,
}: {
  binPath: string;
  logger?: { info(msg: string): void };
}) => {
  return {
    async process({ filePath }: { filePath: string }) {
      logger?.info(`Processing ${filePath}`);
      // ...
    }
  };
};
```

**Benefits**:
- Self-documenting at call sites
- Easy to add optional parameters without breaking changes
- Destructuring makes dependencies explicit
- Works naturally with duck typing (structural interfaces)

**Exception**: Tiny, obvious utilities can use positional parameters:
```typescript
// ✅ OK: Simple utility with obvious parameters
function add(a: number, b: number): number {
  return a + b;
}
```

**Destructuring guidelines**:
- Keep destructuring shallow (one level deep)
- Use defaults on the left-hand side: `{ timeout = 5000 } = {}`
- Avoid nested destructuring in function signatures (hard to read)

---

### Duck Typing (Structural Over Nominal)

**Philosophy**: Accept "shapes" (structure), not nominal type dependencies. TypeScript uses structural typing — if it has the right properties, it's compatible.

**Pattern**:
```typescript
// ✅ GOOD: Accept structural shape (duck typing)
export function useLogger(logger: { info(msg: string): void }) {
  logger.info("Started");
  // Works with ANY object that has an info(string) method
}

// ❌ AVOID: Nominal dependency (tight coupling)
import { Logger } from "../infrastructure/logger";
export function useLogger(logger: Logger) {
  // Now coupled to Logger interface — breaks duck typing
}
```

**Current good example** (already in codebase):
```typescript
// api_types.ts uses structural interfaces
export interface ExifApi {
  readMetadata: (filePath: string) => Promise<ExifData>;
  removeMetadata: (filePath: string) => Promise<object>;
}
```

**Handling excess property checking friction**:

TypeScript rejects object literals with extra properties:
```typescript
// ❌ Error: Object literal may only specify known properties
doThing({ entityId: "123", extraField: "value" });
```

**Solution 1**: Generic constraint (allows extra fields):
```typescript
export function doThing<T extends { entityId: string }>(args: T) {
  // args can have more fields without error
}
```

**Solution 2**: Explicit intersection:
```typescript
type Args = { entityId: string } & Record<string, unknown>;
export function doThing(args: Args) { }
```

**Solution 3**: Use `satisfies` for strict validation (when you want only known keys):
```typescript
const cmd = {
  entityId: "123",
  dryRun: true,
  // typoField: "oops"  // Would error here
} satisfies { entityId: string; dryRun?: boolean };
```

---

### Error Handling (Result Type Pattern)

**Standard pattern**: Use `{ data: T | null; error: string | null }` for operations that can fail.

**Current good example** (already implemented):
```typescript
// infrastructure/exiftool/types.ts
export interface ExifToolResult {
  data: Record<string, unknown>[] | null;
  error: string | null;
}

// Usage in ExiftoolProcess.ts
async readMetadata(filePath: string, args: string[]): Promise<ExifToolResult> {
  try {
    // ...
    return { data: parsed, error: null };
  } catch (err) {
    return { data: null, error: `Failed: ${err}` };
  }
}
```

**Consumer pattern**:
```typescript
const result = await exiftool.readMetadata(filePath, args);
if (result.error !== null) {
  console.error(result.error);
  return;
}
// Here, result.data is guaranteed non-null
processData(result.data);
```

**Use Error objects, not string throws**:

**Anti-pattern found** (fix during refactoring):
```typescript
// ❌ BAD: String throws (8 instances in renderer)
throw "Could not find file list pane element";

// ✅ GOOD: Error objects preserve stack traces
throw new Error("Could not find file list pane element");
```

**Why Error objects**:
- Preserve stack traces for debugging
- Enable `instanceof Error` checks
- Allow error subclassing for different error types
- Standard JavaScript/TypeScript convention

**For Phase 6 DDD refactor**: Standardize on Result type everywhere (infrastructure, application, domain layers).

**Discriminated unions for multi-state results**:

```typescript
// Future pattern for Phase 6
type ProcessingResult =
  | { type: "success"; tagsRemoved: number }
  | { type: "failure"; reason: string }
  | { type: "skipped"; reason: string };

function handleResult(result: ProcessingResult): void {
  switch (result.type) {
    case "success":
      console.log(`Removed ${result.tagsRemoved} tags`);
      break;
    case "failure":
      console.error(`Failed: ${result.reason}`);
      break;
    case "skipped":
      console.warn(`Skipped: ${result.reason}`);
      break;
    default:
      // Exhaustiveness check with never
      const _never: never = result;
      throw new Error(`Unhandled result type: ${_never}`);
  }
}
```

---

## Code Quality

### Comments (Add Meaning, Not Types)

**Rule**: Do not write comments that restate TypeScript types. Comments must add meaning (invariants, business rules, edge cases).

```typescript
// ❌ BAD: Comment restates the type
// Returns a promise of a number
async function open(): Promise<number>

// ✅ GOOD: Comment adds context beyond the type
// Returns process PID for external monitoring/cleanup
async function open(): Promise<number>
```

**When to add comments**:
- **Invariants**: `// Safe: process checked above, guaranteed non-null`
- **Business rules**: `// User emails must be verified before sending notifications`
- **Edge cases**: `// Empty arrays are valid - represents "no metadata found"`
- **Non-obvious performance**: `// Uses stay_open mode to avoid spawning Perl for each file (~90ms saved per file)`

**Don't comment**:
- Parameter types (visible in signature)
- Return types (visible in signature)
- What the code does (should be self-evident from names)

---

### Exhaustiveness (Discriminated Unions + never)

**Pattern for exhaustive switch statements**:

```typescript
type FileType = "image" | "video" | "pdf";

function processFile(type: FileType): void {
  switch (type) {
    case "image":
      processImage();
      break;
    case "video":
      processVideo();
      break;
    case "pdf":
      processPdf();
      break;
    default:
      // Exhaustiveness check: if a new FileType is added, this errors
      const _exhaustive: never = type;
      throw new Error(`Unhandled file type: ${_exhaustive}`);
  }
}
```

**How it works**:
- If all cases are handled, `type` is narrowed to `never` in the default branch
- If a new union member is added, TypeScript errors: "Type 'newMember' is not assignable to type 'never'"
- Forces you to update all switch statements when extending the union

**Combine with `noFallthroughCasesInSwitch`** to prevent accidental fallthrough bugs.

---

### Verbosity (Trust Inference)

**Rule**: Keep types minimal. Let inference work internally; annotate only at boundaries or when clarity improves.

```typescript
// ✅ GOOD: Inference works internally
function processFiles(paths: string[]) {
  const results = paths.map(p => readFile(p));  // Type inferred: Array<FileResult | null>
  return results.filter(r => r !== null);        // Type inferred: Array<FileResult>
}

// ✅ GOOD: Explicit type at module boundary
export function processFiles(paths: string[]): FileResult[] {
  // ...
}
```

**Avoid redundant annotations**:
```typescript
// ❌ BAD: Redundant type annotation
const count: number = files.length;

// ✅ GOOD: Let inference work
const count = files.length;
```

**When to annotate explicitly**:
- Module boundaries (exported functions)
- Complex generic types where inference fails
- When type annotation clarifies intent (e.g., `const results: string[] = []` vs `const results = []`)

---

## Codebase Examples

### Good Patterns to Follow

**1. ExiftoolProcess.ts** — Infrastructure layer class design

✅ **Explicit return types on all public methods**:
```typescript
async open(): Promise<number> { /* ... */ }
async close(): Promise<ExifToolCloseResult> { /* ... */ }
async readMetadata(filePath: string, args: string[]): Promise<ExifToolResult> { /* ... */ }
```

✅ **Private methods for internal state management**:
```typescript
private sendCommand(executeNum: number, command: string): Promise<ExifToolResult> { /* ... */ }
private parseStdout(chunk: string): void { /* ... */ }
```

✅ **Union return types** (Result pattern):
```typescript
export interface ExifToolResult {
  data: Record<string, unknown>[] | null;
  error: string | null;
}
```

✅ **Proper async/await patterns**, no callback hell

✅ **Error handling with Error objects** (not strings)

---

**2. api_types.ts** — Type definitions for IPC

✅ **Interface-based API design**:
```typescript
export interface ExifApi {
  readMetadata: (filePath: string) => Promise<ExifData>;
  removeMetadata: (filePath: string) => Promise<object>;
}
```

✅ **Clean callback signatures with unsubscribe pattern**:
```typescript
onFileOpenAddFiles: (callback: (filePaths: string[]) => void) => () => void;
// Returns cleanup function for removing listener
```

✅ **Type re-exports for cross-module usage**:
```typescript
export type { I18nStringsDictionary } from "../common/i18n";
```

---

**3. i18n_lookup.ts** — Pure domain logic

✅ **Zero dependencies** — fully testable without I/O mocks

✅ **Enum for constants**:
```typescript
export enum Locale {
  Chinese = "zh",
  English = "en",
  // ...
}
```

✅ **Type aliases for complex structures**:
```typescript
export type I18nStringSet = { [locale: string]: string };
```

✅ **Explicit error throwing on invariant violations**:
```typescript
if (!allStrings[locale]) {
  throw new Error(`Locale ${locale} not found in strings`);
}
```

---

### Anti-Patterns to Fix (Future Work)

**1. table_update_row.ts** — Usage of `any`

❌ **Lines 5 and 37**: `exifData: any` should be `exifData: ExifData`

**Fix**:
```typescript
// Before
export function updateRowWithExif(
  tdNode: HTMLTableCellElement,
  exifData: any,
): void {

// After
import type { ExifData } from "../preload/api_types";
export function updateRowWithExif(
  tdNode: HTMLTableCellElement,
  exifData: ExifData,
): void {
```

---

**2. Renderer files** — String throws instead of Error objects

❌ **8 instances across renderer files**:
- `add_files.ts`
- `select_files.ts`
- `table_update_row.ts`
- etc.

**Fix**:
```typescript
// Before
throw "Could not find file list pane element";

// After
throw new Error("Could not find file list pane element");
```

---

**3. ExiftoolProcess.ts** — Non-null assertion without comment

⚠️ **Line 188**: `this.process!.stdin!.write(...)`

**Fix**: Add comment explaining invariant:
```typescript
// Safe: process and stdin guaranteed non-null after sendCommand validation (line 126-127)
this.process!.stdin!.write(command + "\n");
```

---

**4. exif_handlers.ts** — Unchecked array access

⚠️ **Line 27**: `result.data[0]` without bounds check

**Fix** (when `noUncheckedIndexedAccess` enabled):
```typescript
// Before
return cleanExifData(result.data[0]);

// After
const firstItem = result.data[0];
if (firstItem === undefined) {
  return {};
}
return cleanExifData(firstItem);
```

---

## Quick Wins (Future Implementation)

These are prioritized fixes to be done during normal development or Phase 6 DDD refactor.

### Priority 1: Replace `any` with `ExifData`

**Effort**: 5 minutes
**Impact**: High (type safety for EXIF display)
**Files**: `src/renderer/table_update_row.ts` (2 occurrences)

```diff
- export function updateRowWithExif(tdNode: HTMLTableCellElement, exifData: any): void {
- function buildExifString({ exifData }: { exifData: any }): string {
+ import type { ExifData } from "../preload/api_types";
+ export function updateRowWithExif(tdNode: HTMLTableCellElement, exifData: ExifData): void {
+ function buildExifString({ exifData }: { exifData: ExifData }): string {
```

---

### Priority 2: Change string throws to Error objects

**Effort**: 10 minutes
**Impact**: Medium (better error messages, stack traces)
**Files**: 8 instances across renderer files

```diff
- throw "Could not find file list pane element";
+ throw new Error("Could not find file list pane element");
```

---

### Priority 3: Add comment to non-null assertion

**Effort**: 2 minutes
**Impact**: Low (code clarity)
**Files**: `src/infrastructure/exiftool/ExiftoolProcess.ts` line 188

```diff
+ // Safe: process and stdin guaranteed non-null after sendCommand validation
  this.process!.stdin!.write(command + "\n");
```

---

### Priority 4: Enable strict tsconfig flags

**Effort**: 2-3 hours (fix 5-10 array accesses and property accesses)
**Impact**: High (prevent undefined access bugs)
**Action**: Add to `tsconfig.json` incrementally

```json
{
  "compilerOptions": {
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

**Strategy**: Enable one flag at a time, fix errors, commit. Repeat for next flag.

---

## Integration with Phase 6: DDD Architecture Refactor

These TypeScript patterns align with the DDD refactor plan in [`devplans/07-ddd-architecture-refactor.md`](../../devplans/07-ddd-architecture-refactor.md).

### Value Objects (Phase 6) → Use Branded Types

```typescript
// From DDD plan - Branded type for FilePath
type FilePath = string & { readonly __brand: "FilePath" };

function createFilePath(path: string): FilePath {
  if (!path) throw new Error("File path cannot be empty");
  if (!path.startsWith("/")) throw new Error("File path must be absolute");
  return path as FilePath;
}

// Usage: Type system prevents string/FilePath mixups
function processFile(path: FilePath): void {
  // Only accepts FilePath, not raw strings
}

const path = createFilePath("/Users/jon/file.jpg");
processFile(path);  // ✅ OK
processFile("/raw/string");  // ❌ Error: string is not assignable to FilePath
```

---

### Result Types (Phase 6) → Extend Current Pattern

```typescript
// Standardize on Result<T, E> everywhere (not just infrastructure)
type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// Application layer
export type StripMetadataResult = Result<
  { tagsRemoved: number },
  "FileNotFound" | "ExifToolError" | "PermissionDenied"
>;
```

---

### Command/Query Interfaces (Phase 6) → Follow Named Args + Duck Typing

```typescript
// From DDD plan - Commands use named args, accept duck-typed deps
export const makeStripMetadataCommand = ({
  exiftoolAdapter,
  logger,
}: {
  exiftoolAdapter: { remove(path: string): Promise<Result<void, string>> };
  logger?: { info(msg: string): void };
}) => ({
  async execute({ filePath }: { filePath: string }): Promise<StripMetadataResult> {
    logger?.info(`Stripping metadata from ${filePath}`);
    const result = await exiftoolAdapter.remove(filePath);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    return { ok: true, value: { tagsRemoved: 42 } };
  }
});

export type StripMetadataCommand = ReturnType<typeof makeStripMetadataCommand>;
```

---

### Discriminated Unions (Phase 6) → Use for Domain Events and States

```typescript
// Domain events
type ProcessingEvent =
  | { type: "started"; filePath: string; timestamp: Date }
  | { type: "completed"; filePath: string; tagsRemoved: number; timestamp: Date }
  | { type: "failed"; filePath: string; error: string; timestamp: Date };

// Exhaustive handling
function handleEvent(event: ProcessingEvent): void {
  switch (event.type) {
    case "started":
      console.log(`Started ${event.filePath} at ${event.timestamp}`);
      break;
    case "completed":
      console.log(`Removed ${event.tagsRemoved} tags from ${event.filePath}`);
      break;
    case "failed":
      console.error(`Failed ${event.filePath}: ${event.error}`);
      break;
    default:
      const _never: never = event;
      throw new Error(`Unhandled event: ${_never}`);
  }
}
```

---

## References

**Deep dive**: [devplans/deep-research-report-typescript-best-practices.md](../../devplans/deep-research-report-typescript-best-practices.md)
**General conventions**: [CLAUDE.md](../../CLAUDE.md)
**DDD architecture**: [devplans/07-ddd-architecture-refactor.md](../../devplans/07-ddd-architecture-refactor.md)
**Modernization roadmap**: [.claude/rules/modernization-roadmap.md](./modernization-roadmap.md)

---

*TypeScript conventions codified: February 15, 2026*
*Estimated implementation effort for Quick Wins: 3-4 hours total*
