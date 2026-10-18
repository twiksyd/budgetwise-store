export type IdenticonShape = "square" | "circle" | "diamond" | "triangle";
export interface IdenticonSpec {
  fg: string;
  bg: string;
  shape: IdenticonShape;
  cells: Array<[number, number]>;
}
export const SEED_PATTERN: RegExp;
export const SHAPES: readonly IdenticonShape[];
export function safeGooglePhotoUrl(value: unknown): string | null;
export function identiconSpec(seed: unknown): IdenticonSpec | null;
export function initialsOf(name: unknown): string;
