import { normalizePlainTextMessage } from "@/lib/order-message.mjs";

function copyWithTextarea(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    const copied = document.execCommand("copy");
    if (!copied) throw new Error("Fallback copy failed.");
  } finally {
    document.body.removeChild(textarea);
  }
}

export async function copyPlainText(text: string) {
  const normalized = normalizePlainTextMessage(text);

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(normalized);
      return;
    } catch {
      // Some in-app browsers expose the API but reject writes. Fall through
      // to the textarea path while the click gesture is still active.
    }
  }

  copyWithTextarea(normalized);
}
