import type { MetadataError } from "exifcleaner-node";
import { classifyFallback } from "exifcleaner-node";

// The ONE module in the app allowed to mint fallback authority (D-06).
// Authority comes solely from the library's own classifyFallback — this
// module restates no phase/nativeWrite truth table.
//
// Honest limit: TypeScript cannot express linear/affine consumption. The
// guarantee below is unforgeable (module-private brand, no other module can
// construct a grant) + single-mint-site (mintFallbackGrant is the only
// constructor) + runtime-affine (a WeakSet enforces at-most-once redemption
// at runtime). It is NOT type-enforced linearity — nothing stops a caller
// from holding a reference to an already-redeemed grant; redeemFallbackGrant
// simply returns false for it.

const fallbackGrantBrand: unique symbol = Symbol("fallbackGrant");

export interface FallbackGrant {
	readonly [fallbackGrantBrand]: true;
}

const unredeemedGrants = new WeakSet<FallbackGrant>();

export function mintFallbackGrant(
	error: MetadataError,
): FallbackGrant | undefined {
	if (classifyFallback(error) !== "safe-to-fallback") {
		return undefined;
	}
	const grant: FallbackGrant = { [fallbackGrantBrand]: true };
	unredeemedGrants.add(grant);
	return grant;
}

export function redeemFallbackGrant(grant: FallbackGrant): boolean {
	if (!unredeemedGrants.has(grant)) {
		return false;
	}
	unredeemedGrants.delete(grant);
	return true;
}
