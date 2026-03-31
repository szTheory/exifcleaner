export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
