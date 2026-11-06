/** Game state is plain JSON, so a JSON round trip is a complete deep copy, and it also works on immer drafts. */
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
