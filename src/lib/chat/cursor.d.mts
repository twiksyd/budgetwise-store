export function toMicros(iso: unknown): number;
export interface Position {
  createdAt: string;
  id: string;
}
export function comparePositions(a: Position, b: Position): -1 | 0 | 1;
export function isAtOrBefore(
  message: Position,
  cursor: { at: string | null; messageId: string | null } | null | undefined,
): boolean;
