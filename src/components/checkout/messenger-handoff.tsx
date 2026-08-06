"use client";

import { useRef, useState } from "react";
import {
  Check,
  Copy,
  Send,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyPlainText } from "@/lib/plain-text-clipboard";
import { cn } from "@/lib/utils";

const MESSAGE_PREVIEW_LINE_LIMIT = 14;
const MESSAGE_PREVIEW_ITEM_LIMIT = 3;

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

  async function handleCopyAndOpenMessenger() {
    let copiedBackup = false;

    try {
      await copyMessage();
      copiedBackup = true;
    } catch {
      setCopyFailed(true);
    }

    toast.success("Binubuksan ang Messenger.", {
      description: copiedBackup
        ? "Naka-ready na ang order message. Pindutin lang po ang Send."
        : "Kung walang message, gamitin ang preview bilang backup.",
    });

    if (messengerLink) {
      window.setTimeout(() => {
        window.location.href = messengerLink;
      }, 250);
    }
  }

  return (
    <div className="space-y-4">
      <div className="surface-premium rounded-2xl p-3.5 sm:p-5">
        <div className="text-center">
          <p className="text-primary text-xs font-semibold tracking-wide uppercase">
            Final step
          </p>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            I-click ang button sa ibaba. Magbubukas ang Messenger na
            naka-ready na ang buong order message.
          </p>
        </div>

        <div className="mt-3 flex flex-col gap-2.5">
          <Button
            size="lg"
            onClick={handleCopyAndOpenMessenger}
            className="h-12 w-full text-base font-semibold"
            disabled={!messengerLink}
          >
            <Send className="size-5" />
            Buksan ang Messenger
          </Button>
          <p className="text-muted-foreground -mt-1 text-center text-xs leading-relaxed">
            I-check ang message at pindutin lang po ang Send.
            <br />
            Hindi lumabas ang message? I-paste po ang nakopyang order message
            sa Messenger.
          </p>
        </div>

        {copyFailed ? (
          <p className="text-destructive mt-3 text-sm leading-relaxed">
            Na-block ng browser ang copy. Piliin ang buong message sa preview,
            tapos i-paste sa Messenger.
          </p>
        ) : copied ? (
          <p className="text-primary mt-3 text-sm font-medium leading-relaxed">
            Nakopya na rin bilang backup.
          </p>
        ) : null}

        <div className="bg-amber-500/10 text-amber-950 dark:text-amber-100 border-amber-500/20 mt-3 rounded-xl border p-3.5">
          <div className="flex gap-2.5">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
            <div>
              <p className="text-sm font-semibold leading-relaxed">
                Buong order message po ang i-send.
              </p>
              <p className="mt-1 text-xs leading-relaxed">
                Hindi sapat ang order number o screenshot lang. Kailangan naming
                makita ang Facebook Name, Roblox Username, items, at total.
              </p>
            </div>
          </div>
        </div>

        <p className="text-muted-foreground mt-3 text-center text-xs font-medium [font-variant-numeric:tabular-nums]">
          Order No.: <span className="text-foreground">{orderNumber}</span>
        </p>

        <div className="border-border mt-3 border-t pt-3">
          <PreparedMessagePreview message={message} />
        </div>
      </div>

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
            <p className="mt-1 text-sm leading-relaxed">
              Huwag po munang magsend ng payment habang wala pa kaming official
              payment instructions.
            </p>
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
              Pag na-send niyo na po yung order slip, hintayin muna yung reply
              namin. Kami po ang magsesend ng tamang payment details bago kayo
              magbayad.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PreparedMessagePreview({ message }: { message: string }) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const messageLines = message.split(/\r?\n/);
  const itemCount = message.match(/^•/gm)?.length ?? 0;
  const isLongMessage =
    itemCount > MESSAGE_PREVIEW_ITEM_LIMIT ||
    messageLines.length > 24 ||
    message.length > 700;
  const displayedMessage =
    isLongMessage && !expanded
      ? messageLines.slice(0, MESSAGE_PREVIEW_LINE_LIMIT).join("\n").trimEnd()
      : message;

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
    }
  }

  function handleTogglePreview() {
    setExpanded((current) => !current);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        previewRef.current?.scrollIntoView({
          block: "start",
          behavior: "smooth",
        });
      });
    });
  }

  return (
    <div ref={previewRef} className="scroll-mt-36">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-sm font-semibold">
            Ito ang I-send sa Messenger
          </h2>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            Ito ang buong message na lalabas sa Messenger.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Kopyahin ang buong order message"
          className="border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground inline-flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      </div>

      <div
        className={cn(
          "bg-muted/60 text-foreground mt-3 rounded-xl p-3.5",
          isLongMessage &&
            !expanded &&
            "relative after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-10 after:rounded-b-xl after:bg-gradient-to-t after:from-muted after:to-transparent",
        )}
      >
        <pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap">
          {displayedMessage}
        </pre>
      </div>

      {isLongMessage ? (
        <button
          type="button"
          onClick={handleTogglePreview}
          className="text-primary hover:text-primary/80 focus-visible:ring-ring mt-2.5 inline-flex min-h-10 items-center rounded-md text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          {expanded ? "Paiksiin" : "Tingnan ang Buong Message"}
        </button>
      ) : null}
    </div>
  );
}
