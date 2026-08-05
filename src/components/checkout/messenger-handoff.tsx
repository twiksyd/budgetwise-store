"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const steps = [
  "Review your order below",
  "Tap \"Open Messenger\" — it opens with your order already typed in",
  "Just hit Send",
];

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

      <ol className="text-muted-foreground mt-4 flex flex-col gap-2 text-sm">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-2.5">
            <span className="text-foreground font-medium">{i + 1}.</span>
            {step}
          </li>
        ))}
      </ol>

      <pre className="bg-muted/60 mt-5 rounded-xl p-4 text-xs leading-relaxed whitespace-pre-wrap">
        {message}
      </pre>

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
        <Button
          variant="outline"
          onClick={handleCopy}
          className="h-11 flex-1"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          Copy message
        </Button>
        {messengerLink ? (
          <Button asChild className="h-11 flex-1">
            <a href={messengerLink} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-4" />
              Open Messenger
            </a>
          </Button>
        ) : (
          <Button disabled className="h-11 flex-1">
            <MessageCircle className="size-4" />
            Open Messenger
          </Button>
        )}
      </div>
    </div>
  );
}
