export const ALBUM_MAX_IMAGES: number;
export const THUMB_MAX_BYTES: number;
export const ALBUM_LABELS: readonly ["proof_of_delivery"];
export const ALBUM_LABEL_TEXT: Readonly<Record<"proof_of_delivery", string>>;
export const UPLOAD_CONCURRENCY: number;

export function parseUploadFields(input: {
  position: unknown;
  clientMessageId: unknown;
}): { ok: true; position: number; clientMessageId: string } | { ok: false; error: string };

export interface AlbumRequestItem {
  position: number;
  width: number | null;
  height: number | null;
}
export function parseAlbumRequest(
  input: unknown,
  options: { role: "admin" | "customer" },
):
  | { ok: true; clientMessageId: string; body: string; label: "proof_of_delivery" | null; items: AlbumRequestItem[] }
  | { ok: false; error: string; status?: number };

export interface UploadedAlbumFile {
  position: number;
  path: string;
  mime: string;
  size: number;
  thumbPath: string | null;
  thumbMime: string | null;
}
export function buildAlbumAttachments(
  items: AlbumRequestItem[],
  uploads: Map<number, UploadedAlbumFile>,
):
  | {
      ok: true;
      attachments: Array<{
        position: number;
        path: string;
        mime: string;
        size: number;
        thumb_path: string;
        thumb_mime: string;
        width: number | null;
        height: number | null;
      }>;
    }
  | { ok: false; missing: number[]; error: string };

export function albumLayout(count: number): {
  shown: number;
  overflow: number;
  pattern: "none" | "single" | "pair" | "feature" | "grid";
};
export function albumCaption(album: { label: "proof_of_delivery" | null; items: unknown[] } | null): {
  title: string | null;
  countText: string | null;
};
