export function assertNever(value: never, message?: string): never {
	throw new Error(message ?? `Unexpected value: ${String(value)}`);
}

export function getOrThrow<K, V>(map: Map<K, V>, key: K): V {
	const value = map.get(key);
	if (value === undefined) {
		throw new Error(`Map missing expected key: ${String(key)}`);
	}
	return value;
}
