"use client";

import { useRef, useState } from "react";
import { Check, Copy, MessageCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MESSAGE_PREVIEW_LINE_LIMIT = 14;
const MESSAGE_PREVIEW_ITEM_LIMIT = 3;

export function MessengerHandoff({
  message,
  messengerLink,
}: {
  message: string;
  messengerLink: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("Order message copied.", {
        description:
          "Open Messenger, paste the message, and wait for our payment instructions before sending any payment.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select the message preview manually.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="surface-premium rounded-2xl p-4 sm:p-6">
        <div>
          <p className="text-primary text-xs font-semibold tracking-wide uppercase">
            Final step
          </p>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Send your prepared order message on Messenger so we can review it.
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {messengerLink ? (
            <Button
              asChild
              size="lg"
              className="h-[58px] w-full text-base font-semibold"
            >
              <a href={messengerLink} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="size-5" />
                Open Messenger
              </a>
            </Button>
          ) : (
            <Button
              disabled
              size="lg"
              className="h-[58px] w-full text-base font-semibold"
            >
              <MessageCircle className="size-5" />
              Open Messenger
            </Button>
          )}

          <Button
            size="lg"
            variant="outline"
            onClick={handleCopy}
            className="h-[58px] w-full text-base font-semibold"
          >
            {copied ? (
              <Check className="size-5" />
            ) : (
              <Copy className="size-5" />
            )}
            Copy Message
          </Button>
        </div>

        <div className="border-border mt-5 border-t pt-4">
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
            <p className="mt-1 text-sm leading-relaxed">
              After sending your order slip, please wait for a BudgetWise
              representative to reply with the official payment instructions.
            </p>
            <p className="mt-1 text-sm font-medium leading-relaxed">
              Do not send any payment before receiving our message.
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
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("Order message copied.", {
        description:
          "Open Messenger, paste the message, and wait for our payment instructions before sending any payment.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select the message preview manually.");
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
            Prepared Message
          </h2>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            This is the message that will be sent to BudgetWise.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy prepared Messenger message"
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
        <pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap">{displayedMessage}</pre>
      </div>

      {isLongMessage ? (
        <button
          type="button"
          onClick={handleTogglePreview}
          className="text-primary hover:text-primary/80 focus-visible:ring-ring mt-2.5 inline-flex min-h-10 items-center rounded-md text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          {expanded ? "Show less" : "View full message"}
        </button>
      ) : null}
    </div>
  );
}
