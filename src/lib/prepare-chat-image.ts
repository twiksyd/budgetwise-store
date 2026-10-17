import { MAX_ATTACHMENT_BYTES } from "@/lib/order-chat.mjs";

const MAX_DIMENSION = 1600;
// Below this a photo goes up exactly as picked; above it, phone photos are
// downscaled so slow mobile connections don't stall on a 6 MB screenshot.
const SKIP_COMPRESSION_BELOW_BYTES = 1.5 * 1024 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unreadable image"));
    };
    image.src = url;
  });
}

/**
 * Returns a file that is safe to upload: the original when it is already
 * small, otherwise a downscaled JPEG. Falls back to the original if the
 * browser can't re-encode it (the server still enforces the size cap).
 */
export async function prepareChatImage(file: File): Promise<File> {
  if (file.size <= SKIP_COMPRESSION_BELOW_BYTES) return file;

  try {
    const image = await loadImage(file);
    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    if (!blob || blob.size >= file.size || blob.size > MAX_ATTACHMENT_BYTES) {
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

const THUMB_MAX_DIMENSION = 480;

export interface PreparedAlbumImage {
  file: File;
  thumb: Blob;
  width: number | null;
  height: number | null;
}

async function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * An album image ready to upload: the (possibly downscaled) image plus a
 * small thumbnail for chat tiles, made here in the browser so the chat
 * never downloads full images just to show a grid. WebP where the browser
 * can encode it, JPEG otherwise (older iOS Safari).
 */
export async function prepareAlbumImage(original: File): Promise<PreparedAlbumImage> {
  const file = await prepareChatImage(original);
  const image = await loadImage(file);
  const width = image.naturalWidth || null;
  const height = image.naturalHeight || null;
  const scale = Math.min(1, THUMB_MAX_DIMENSION / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
  canvas.height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare images.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let thumb = await encode(canvas, "image/webp", 0.72);
  if (!thumb || thumb.type !== "image/webp") thumb = await encode(canvas, "image/jpeg", 0.72);
  if (!thumb) throw new Error("This image could not be read.");
  canvas.width = 0;
  canvas.height = 0;
  return { file, thumb, width, height };
}
