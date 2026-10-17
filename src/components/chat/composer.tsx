"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { BadgeCheck, ImagePlus, Plus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_MESSAGE_LENGTH } from "@/lib/order-chat.mjs";
import { ALBUM_MAX_IMAGES } from "@/lib/chat/album.mjs";
import {
  applyQuickReply,
  closedMenu,
  quickReplyMenuReducer,
  selectedReply,
  type QuickReplyItem,
} from "@/lib/chat/quick-reply-menu.mjs";
import { renderTemplate, type TemplateVariable } from "@/lib/chat/template.mjs";
import { cn } from "@/lib/utils";

const MAX_HEIGHT_PX = 168;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// Phone photos above 4 MB are downscaled before upload; anything this big
// is not a normal photo.
const MAX_PICK_BYTES = 30 * 1024 * 1024;

interface Picked {
  id: string;
  file: File;
  previewUrl: string;
}

function isTouchKeyboard() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Message box. Enter sends, Shift+Enter adds a line (on touch keyboards,
 * which have no Shift, Enter adds a line and the Send button sends).
 * A synchronous lock + clearing the text in the same handler means a
 * double Enter or double tap can never send the same text twice.
 */
export function Composer({
  placeholder,
  onSendText,
  onSendImages,
  allowProofLabel = false,
  quickReplies,
  templateValues,
  onTyping,
  onStopTyping,
  actions,
  disabled = false,
}: {
  placeholder: string;
  onSendText: (text: string) => void;
  /** 1..10 images (with an optional caption) sent as ONE message. */
  onSendImages: (files: File[], caption: string, label: "proof_of_delivery" | null) => void;
  /** BudgetWise only: offer the "Proof of delivery" album label. */
  allowProofLabel?: boolean;
  quickReplies?: QuickReplyItem[];
  templateValues?: Partial<Record<TemplateVariable, string | number | null>>;
  onTyping?: () => void;
  onStopTyping?: () => void;
  actions?: React.ReactNode;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const textRef = useRef("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const pickedRef = useRef<Picked[]>([]);
  pickedRef.current = picked;
  const [proof, setProof] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, dispatchMenu] = useReducer(quickReplyMenuReducer, closedMenu);
  const sendLock = useRef(false);

  // Previews are released when removed, sent, or when the composer unmounts.
  useEffect(() => () => {
    for (const item of pickedRef.current) URL.revokeObjectURL(item.previewUrl);
  }, []);

  function resize() {
    const node = textarea.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, MAX_HEIGHT_PX)}px`;
  }

  function updateText(next: string, caret?: number) {
    textRef.current = next;
    setText(next);
    if (quickReplies) {
      dispatchMenu({ type: "input", text: next, caret: caret ?? next.length, replies: quickReplies });
    }
    if (next.trim()) onTyping?.();
    else onStopTyping?.();
    requestAnimationFrame(resize);
  }

  function acceptFiles(files: File[]) {
    if (files.length === 0) return;
    const problems: string[] = [];
    const accepted: Picked[] = [];
    const room = ALBUM_MAX_IMAGES - pickedRef.current.length;
    for (const file of files) {
      if (!ACCEPTED_TYPES.has(file.type)) {
        problems.push(`${file.name}: only JPG, PNG or WebP images can be sent.`);
      } else if (file.size > MAX_PICK_BYTES) {
        problems.push(`${file.name}: that image is too large.`);
      } else if (accepted.length >= room) {
        problems.push(`Up to ${ALBUM_MAX_IMAGES} images at a time — ${file.name} was left out.`);
      } else {
        accepted.push({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) });
      }
    }
    setError(problems.length ? problems.join(" ") : null);
    if (accepted.length) setPicked((current) => [...current, ...accepted]);
  }

  function removePicked(id: string) {
    setPicked((current) => {
      const item = current.find((entry) => entry.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return current.filter((entry) => entry.id !== id);
    });
  }

  function clearPicked() {
    for (const item of pickedRef.current) URL.revokeObjectURL(item.previewUrl);
    setPicked([]);
    setProof(false);
    setError(null);
  }

  function send() {
    if (sendLock.current || disabled) return;
    const value = textRef.current.trim();
    const images = pickedRef.current;
    if (!value && images.length === 0) return;
    sendLock.current = true;

    if (images.length) {
      onSendImages(images.map((item) => item.file), value, allowProofLabel && proof ? "proof_of_delivery" : null);
      for (const item of images) URL.revokeObjectURL(item.previewUrl);
      setPicked([]);
      setProof(false);
    } else {
      onSendText(value);
    }
    textRef.current = "";
    setText("");
    setError(null);
    dispatchMenu({ type: "close" });
    onStopTyping?.();
    requestAnimationFrame(() => {
      resize();
      sendLock.current = false;
    });
  }

  function insertReply(reply: QuickReplyItem) {
    if (!menu.range) return;
    const body = renderTemplate(reply.body, templateValues ?? {});
    const result = applyQuickReply(textRef.current, menu.range, body);
    textRef.current = result.text;
    setText(result.text);
    dispatchMenu({ type: "close" });
    onTyping?.();
    requestAnimationFrame(() => {
      const node = textarea.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(result.caret, result.caret);
      resize();
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;

    if (menu.open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Escape") {
        event.preventDefault();
        dispatchMenu({ type: "key", key: event.key });
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const reply = selectedReply(menu);
        if (reply) {
          event.preventDefault();
          insertReply(reply);
          return;
        }
      }
    }

    if (event.key === "Enter" && !event.shiftKey && !isTouchKeyboard()) {
      event.preventDefault();
      send();
    }
  }

  const canSend = !disabled && (text.trim().length > 0 || picked.length > 0);

  return (
    <div className="border-border/60 bg-background relative border-t px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4">
      {menu.open && (
        <div
          className="border-border bg-popover absolute right-3 bottom-full left-3 z-20 mb-2 overflow-hidden rounded-xl border shadow-lg sm:right-4 sm:left-4"
          role="listbox"
          aria-label="Saved replies"
        >
          {menu.items.map((reply, index) => (
            <button
              key={reply.id}
              type="button"
              role="option"
              aria-selected={index === menu.activeIndex}
              onMouseEnter={() => dispatchMenu({ type: "hover", index })}
              onMouseDown={(event) => {
                event.preventDefault();
                insertReply(reply);
              }}
              className={cn(
                "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left",
                index === menu.activeIndex ? "bg-muted" : "",
              )}
            >
              <span className="text-xs">
                <span className="text-primary font-semibold">/{reply.shortcut}</span>
                <span className="text-muted-foreground"> · {reply.title}</span>
              </span>
              <span className="text-muted-foreground line-clamp-1 text-xs">{reply.body}</span>
            </button>
          ))}
          <p className="text-muted-foreground border-border/60 border-t px-3 py-1.5 text-[10px]">
            ↑↓ choose · Enter insert · Esc close — inserts only, you still press Send
          </p>
        </div>
      )}

      {picked.length > 0 && (
        <div className="bg-muted/60 mb-2 rounded-xl p-2" aria-label="Selected images">
          <div className="flex items-center justify-between gap-2 px-0.5 pb-1.5">
            <p className="text-xs font-semibold">
              {picked.length} image{picked.length === 1 ? "" : "s"} selected
            </p>
            <div className="flex items-center gap-1">
              {allowProofLabel && (
                <button
                  type="button"
                  onClick={() => setProof((value) => !value)}
                  aria-pressed={proof}
                  className={cn(
                    "inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold",
                    proof ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                  )}
                >
                  <BadgeCheck className="size-3.5" /> Proof of delivery
                </button>
              )}
              <button type="button" onClick={clearPicked} className="text-muted-foreground hover:text-foreground min-h-8 px-2 text-[11px] font-semibold">
                Cancel
              </button>
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {picked.map((item, index) => (
              <div key={item.id} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                <img src={item.previewUrl} alt={`Selected image ${index + 1}`} className="size-16 rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => removePicked(item.id)}
                  className="bg-foreground/80 text-background absolute -top-1 -right-1 inline-flex size-6 items-center justify-center rounded-full after:absolute after:-inset-2 after:content-['']"
                  aria-label={`Remove image ${index + 1}`}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {picked.length < ALBUM_MAX_IMAGES && (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="border-border text-muted-foreground hover:text-foreground inline-flex size-16 shrink-0 items-center justify-center rounded-lg border border-dashed"
                aria-label="Add more images"
              >
                <Plus className="size-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-destructive mb-1.5 text-xs">
          {error}
        </p>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose images"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            acceptFiles(files);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Attach images (JPG, PNG or WebP, up to 10, 4 MB each)"
          title="Attach photos or screenshots (JPG, PNG, WebP · up to 10 · max 4 MB each)"
          disabled={disabled || picked.length >= ALBUM_MAX_IMAGES}
          onClick={() => fileInput.current?.click()}
          className="size-11 shrink-0 rounded-full"
        >
          <ImagePlus className="size-5" />
        </Button>
        {actions}
        <textarea
          ref={textarea}
          value={text}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={placeholder}
          aria-label="Message"
          disabled={disabled}
          onChange={(event) => updateText(event.target.value, event.target.selectionStart)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            dispatchMenu({ type: "close" });
            onStopTyping?.();
          }}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files).filter((item) => item.type.startsWith("image/"));
            if (files.length) {
              event.preventDefault();
              acceptFiles(files);
            }
          }}
          className="border-input bg-muted/40 focus-visible:border-ring focus-visible:ring-ring/40 max-h-[168px] min-h-11 flex-1 resize-none rounded-2xl border px-3.5 py-2.5 text-base leading-snug outline-none focus-visible:ring-3 sm:text-sm"
        />
        <Button
          type="button"
          size="icon"
          aria-label="Send message"
          disabled={!canSend}
          onClick={send}
          className="size-11 shrink-0 rounded-full"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
