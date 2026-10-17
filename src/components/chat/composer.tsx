"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { ImagePlus, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prepareChatImage } from "@/lib/prepare-chat-image";
import { MAX_MESSAGE_LENGTH, validateAttachmentMeta } from "@/lib/order-chat.mjs";
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
  onSendImage,
  quickReplies,
  templateValues,
  onTyping,
  onStopTyping,
  actions,
  disabled = false,
}: {
  placeholder: string;
  onSendText: (text: string) => void;
  onSendImage: (file: File, caption: string) => void;
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
  const [attachment, setAttachment] = useState<{ file: File; previewUrl: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, dispatchMenu] = useReducer(quickReplyMenuReducer, closedMenu);
  const sendLock = useRef(false);

  useEffect(() => () => {
    if (attachment) URL.revokeObjectURL(attachment.previewUrl);
  }, [attachment]);

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

  async function acceptFile(picked: File | null | undefined) {
    if (!picked) return;
    setError(null);
    setPreparing(true);
    try {
      const prepared = await prepareChatImage(picked);
      const check = validateAttachmentMeta({ type: prepared.type, size: prepared.size });
      if (!check.ok) {
        setError(check.error);
        return;
      }
      setAttachment({ file: prepared, previewUrl: URL.createObjectURL(prepared) });
    } finally {
      setPreparing(false);
    }
  }

  function send() {
    if (sendLock.current || disabled) return;
    if (preparing) {
      setError("Wait for the image to finish preparing.");
      return;
    }
    const value = textRef.current.trim();
    if (!value && !attachment) return;
    sendLock.current = true;

    if (attachment) {
      onSendImage(attachment.file, value);
      setAttachment(null);
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

  const canSend = !disabled && !preparing && (text.trim().length > 0 || attachment !== null);

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

      {attachment && (
        <div className="bg-muted/60 mb-2 flex items-center gap-3 rounded-xl p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
          <img src={attachment.previewUrl} alt="Selected image" className="size-14 rounded-lg object-cover" />
          <p className="min-w-0 flex-1 truncate text-xs">{attachment.file.name}</p>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove image" onClick={() => setAttachment(null)}>
            <X className="size-4" />
          </Button>
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
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const picked = event.target.files?.[0];
            event.target.value = "";
            void acceptFile(picked);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Attach an image (JPG, PNG or WebP, up to 4 MB)"
          title="Attach a photo or screenshot (JPG, PNG, WebP · max 4 MB)"
          disabled={disabled || preparing}
          onClick={() => fileInput.current?.click()}
          className="shrink-0 rounded-full"
        >
          {preparing ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
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
            const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
            if (file) {
              event.preventDefault();
              void acceptFile(file);
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
          className="shrink-0 rounded-full"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
