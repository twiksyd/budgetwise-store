"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const steps = [
  "Copy order (automatic)",
  "Messenger opens automatically",
  "Press Ctrl+V (desktop) or Paste (mobile), then send",
];

export function MessengerHandoff({
  message,
  messengerLink,
}: {
  message: string;
  messengerLink: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  async function handleCopyAndOpen() {
    if (isProcessing) return;
    setIsProcessing(true);

    // Open the tab synchronously, inside the click handler, so browsers don't
    // treat it as a popup — then navigate it once the copy/delay finish.
    // A delayed window.open() call would get silently blocked.
    const messengerWindow = messengerLink
      ? window.open("about:blank", "_blank")
      : null;

    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("Order copied!");
    } catch {
      toast.error("Couldn't copy automatically — copy the message below manually.");
    }

    if (messengerWindow && messengerLink) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      messengerWindow.location.href = messengerLink;
    }

    setIsProcessing(false);
  }

  return (
    <div className="bg-card rounded-xl border p-5">
      <h2 className="font-heading text-sm font-semibold">
        Send us your order
      </h2>

      <ol className="text-muted-foreground mt-3 flex flex-col gap-1.5 text-sm">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-2">
            <span className="text-foreground font-medium">{i + 1}.</span>
            {step}
          </li>
        ))}
      </ol>

      <pre className="bg-muted mt-4 rounded-lg p-3 text-xs whitespace-pre-wrap">
        {message}
      </pre>

      <Button
        onClick={handleCopyAndOpen}
        disabled={isProcessing}
        className="mt-4 w-full"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {isProcessing
          ? "Opening Messenger..."
          : "Copy order & open Messenger"}
      </Button>
    </div>
  );
}
