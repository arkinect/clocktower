/**
 * A complete deep copy of game state, which is Maps, arrays, plain objects and primitives. Written by hand because it
 * must also work on immer drafts, which `structuredClone` refuses. A key set to undefined is dropped, as saving does.
 */
export function clone<T>(value: T): T {
  return copy(value) as T;
}

function copy(v: unknown): unknown {
  if (typeof v !== 'object' || v === null) return v;
  if (Array.isArray(v)) return v.map(copy);
  if (v instanceof Map) {
    const out = new Map<unknown, unknown>();
    for (const [k, x] of v) out.set(k, copy(x));
    return out;
  }
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = copy(x);
  return out;
}
