"use client";

import { Check, HeartHandshake, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchJson, jsonInit, RequestError } from "@/lib/chat/client/fetch-json";
import type { ChatMessageDto } from "@/lib/chat/dto.mjs";

export function VouchRequestAction({
  orderNumber,
  alreadyRequested,
  onSent,
}: {
  orderNumber: string;
  alreadyRequested: boolean;
  onSent: (message: ChatMessageDto) => void;
}) {
  const [sending, setSending] = useState(false);

  async function requestVouch() {
    if (sending || alreadyRequested) return;
    setSending(true);
    try {
      const result = await fetchJson<{ created: boolean; message: ChatMessageDto }>(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/vouch-request`,
        jsonInit("POST", {}),
      );
      onSent(result.message);
      if (result.created) toast.success("Vouch request sent.");
      else toast.info("A vouch request is already in this conversation.");
    } catch (error) {
      toast.error(error instanceof RequestError ? error.message : "Could not request a vouch. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="shrink-0 rounded-full"
      onClick={() => void requestVouch()}
      disabled={sending || alreadyRequested}
      aria-label={alreadyRequested ? "Vouch already requested" : "Request Vouch"}
      title={alreadyRequested ? "Vouch already requested" : "Request Vouch"}
      data-testid="request-vouch-action"
    >
      {sending ? <Loader2 className="size-4 animate-spin" /> : alreadyRequested ? <Check className="size-4 text-emerald-600" /> : <HeartHandshake className="size-4" />}
    </Button>
  );
}
