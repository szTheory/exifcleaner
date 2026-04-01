export type Result<T, E = string> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: E };
