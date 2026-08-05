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

  // Deliberately not an async function: Safari (and some mobile browsers)
  // will silently block window.open() if it's called anywhere inside an
  // async function, even before the first await — the function itself
  // returns a Promise, which is enough to break the "direct user gesture"
  // chain on WebKit. window.open must be the first synchronous thing that
  // runs on tap; everything after it is chained with .then()/.finally().
  function handleCopyAndOpen() {
    if (isProcessing) return;
    setIsProcessing(true);

    const messengerWindow = messengerLink
      ? window.open("about:blank", "_blank")
      : null;

    navigator.clipboard
      .writeText(message)
      .then(() => {
        setCopied(true);
        toast.success("Order copied!");
      })
      .catch(() => {
        toast.error(
          "Couldn't copy automatically — copy the message below manually.",
        );
      })
      .finally(() => {
        if (messengerWindow && messengerLink) {
          setTimeout(() => {
            messengerWindow.location.href = messengerLink;
            setIsProcessing(false);
          }, 1000);
        } else {
          setIsProcessing(false);
        }
      });
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
