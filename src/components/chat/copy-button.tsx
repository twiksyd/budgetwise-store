"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { copyPlainText } from "@/lib/plain-text-clipboard";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  className,
  iconOnly = false,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  iconOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await copyPlainText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Hindi nakopya. Please copy it manually.");
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={iconOnly ? `${label}: ${value}` : undefined}
      className={cn(
        "border-border bg-background hover:bg-muted text-foreground inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
        className,
      )}
    >
      {copied ? <Check className="text-primary size-3.5" /> : <Copy className="size-3.5" />}
      {!iconOnly && <span>{copied ? copiedLabel : label}</span>}
    </button>
  );
}
