interface AssertNeverParams {
	value: never;
	message?: string;
}

export function assertNever({ value, message }: AssertNeverParams): never {
	throw new Error(message ?? `Unexpected value: ${String(value)}`);
}

interface GetOrThrowParams<K, V> {
	map: Map<K, V>;
	key: K;
}

export function getOrThrow<K, V>({ map, key }: GetOrThrowParams<K, V>): V {
	const value = map.get(key);
	if (value === undefined) {
		throw new Error(`Map missing expected key: ${String(key)}`);
	}
	return value;
}
