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
