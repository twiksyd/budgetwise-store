"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

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
      toast.success("Order copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the message below manually.");
    }
  }

  return (
    <div className="surface-premium rounded-2xl p-6 sm:p-7">
      <h2 className="font-heading text-sm font-semibold">
        Send us your order
      </h2>

      <pre className="bg-muted/60 mt-4 rounded-xl p-4 text-xs leading-relaxed whitespace-pre-wrap">
        {message}
      </pre>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        {messengerLink ? (
          <Button asChild size="lg" className="h-14 flex-1 text-base font-semibold">
            <a href={messengerLink} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-5" />
              Open Messenger
            </a>
          </Button>
        ) : (
          <Button disabled size="lg" className="h-14 flex-1 text-base font-semibold">
            <MessageCircle className="size-5" />
            Open Messenger
          </Button>
        )}
        <Button
          variant="outline"
          size="lg"
          onClick={handleCopy}
          className="h-14 flex-1 text-base font-semibold"
        >
          {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
          Copy Message
        </Button>
      </div>
    </div>
  );
}
