"use client";

import { useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Send,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyPlainText } from "@/lib/plain-text-clipboard";

export function MessengerHandoff({
  message,
  messengerLink,
  orderNumber,
}: {
  message: string;
  messengerLink: string | null;
  orderNumber: string;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copyMessage() {
    await copyPlainText(message);
    setCopied(true);
    setCopyFailed(false);
    window.setTimeout(() => setCopied(false), 2200);
  }

  // The button is a real link so the browser follows it inside the tap.
  // Navigating later (after awaiting the copy, or from a timer) makes iOS and
  // the Facebook in-app browser treat it as script-initiated: they load m.me
  // as a web page instead of handing off to the Messenger app, and the
  // pre-filled text is lost. The clipboard write starts in the same tap, so
  // the message is still there to paste when Messenger drops the pre-fill.
  function handleOpenMessenger() {
    copyMessage().catch(() => setCopyFailed(true));

    toast.success("Binubuksan ang Messenger.", {
      description:
        "Kung walang lumabas na message, i-paste lang po — naka-copy na ito.",
    });
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="bg-primary/5 border-primary/10 rounded-2xl border p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-full">
            <CheckCircle2 className="text-primary size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-primary text-xs font-semibold tracking-wide uppercase">
              Order slip ready
            </p>
            <h1 className="font-heading mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              I-send na ang Inyong Order
            </h1>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              Hindi pa po namin mare-review ang order hangga&apos;t hindi ninyo
              ito naipapadala sa Messenger.
            </p>
            <p className="text-muted-foreground mt-3 text-xs font-medium [font-variant-numeric:tabular-nums]">
              Order No.:{" "}
              <span className="text-foreground font-semibold">
                {orderNumber}
              </span>
            </p>
          </div>
        </div>

        {messengerLink ? (
          <Button
            asChild
            size="lg"
            className="messenger-handoff-cta mt-4 h-auto min-h-12 w-full py-3 text-base leading-snug font-semibold whitespace-normal active:scale-[0.98] active:translate-y-0"
          >
            <a href={messengerLink} onClick={handleOpenMessenger}>
              <Send className="size-5" />
              <span className="min-w-0">
                Click Here to Open Messenger and Send Your Order
              </span>
            </a>
          </Button>
        ) : (
          <Button
            size="lg"
            className="mt-4 h-auto min-h-12 w-full py-3 text-base leading-snug font-semibold whitespace-normal"
            disabled
          >
            <Send className="size-5" />
            <span className="min-w-0">
              Click Here to Open Messenger and Send Your Order
            </span>
          </Button>
        )}

        <p className="text-muted-foreground mt-2 text-center text-xs leading-relaxed">
          Kung walang lumabas na message sa Messenger, i-paste lang po
          (long-press → Paste) — automatic na itong naka-copy. Huwag lang po
          i-screenshot, kailangan talaga i-send.
        </p>

        {copyFailed ? (
          <p className="text-destructive mt-3 text-sm leading-relaxed">
            Na-block ng browser ang copy. Piliin ang buong message sa ibaba,
            tapos i-paste sa Messenger.
          </p>
        ) : copied ? (
          <p className="text-primary mt-3 text-sm font-medium leading-relaxed">
            Nakopya na rin bilang backup.
          </p>
        ) : null}
      </section>

      <div className="bg-amber-500/10 text-amber-950 dark:text-amber-100 border-amber-500/20 rounded-2xl border p-4">
        <div className="flex gap-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
          <div>
            <p className="text-xs font-semibold tracking-wide uppercase">
              Wait for our reply
            </p>
            <p className="mt-1 text-sm font-semibold leading-relaxed">
              Hintayin muna ang reply at official payment instructions namin
              bago magsend ng payment.
            </p>
          </div>
        </div>
      </div>

      <PreparedMessagePreview message={message} />
    </div>
  );
}

export function PreparedMessagePreview({ message }: { message: string }) {
  const previewRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await copyPlainText(message);
      setCopied(true);
      toast.success("Nakopya ang buong order message.", {
        description: "I-paste at i-send ito sa Messenger.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Hindi nakopya. Piliin ang message preview manually.");
      selectMessageText();
    }
  }

  function selectMessageText() {
    const node = messageRef.current;
    if (!node) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  return (
    <section ref={previewRef} className="scroll-mt-36">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-heading text-base font-semibold tracking-tight">
            ITO ANG BUONG I-SEND SA MESSENGER
          </h2>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            Kopyahin at i-send po ang buong message sa ibaba. Kung walang
            lumabas sa Messenger, gamitin ang Select All.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={selectMessageText}
            className="border-border bg-background hover:bg-muted text-foreground inline-flex min-h-10 items-center justify-center rounded-lg border px-3 text-xs font-semibold transition-colors"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="border-border bg-background hover:bg-muted text-foreground inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            Copy Order Message
          </button>
        </div>
      </div>

      <div className="bg-primary/5 border-primary/10 text-foreground mt-3 max-w-full overflow-hidden rounded-2xl border p-4">
        <pre
          ref={messageRef}
          className="font-sans text-[13px] leading-relaxed break-words whitespace-pre-wrap"
        >
          {message}
        </pre>
      </div>
    </section>
  );
}
