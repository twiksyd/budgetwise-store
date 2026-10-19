"use client";

import { useMemo, useState } from "react";
import { MessageSquare, Search, ArrowUpRight, ReceiptText } from "lucide-react";
import type { ChatMessageDto } from "@/lib/chat/dto.mjs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const timestamp = new Intl.DateTimeFormat("en-PH", {
  month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila",
});

/** Navigation over messages already loaded; never fetches or acknowledges history. */
export function ConversationTools({ messages, onJump, onReply, canReply }: {
  messages: ChatMessageDto[];
  onJump: (id: string) => void;
  onReply: () => void;
  canReply: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const recentCustomer = [...messages].reverse().find((message) => message.senderRole === "customer" && !message.historyOrderNumber);
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return [...messages].reverse().filter((message) => {
      const text = [message.body, message.orderRef, message.historyOrderNumber, message.order?.orderNumber, message.payment?.orderNumber].filter(Boolean).join(" ").toLocaleLowerCase();
      const matchesType = filter === "all" || (filter === "customer" && message.senderRole === "customer") || (filter === "payments" && Boolean(message.payment || message.paymentReceived || message.hasAttachment || message.kind === "album"));
      return matchesType && (!needle || text.includes(needle));
    });
  }, [messages, query, filter]);

  return (
    <div className="border-border/60 bg-muted/20 flex shrink-0 flex-wrap items-center gap-1 border-b px-3 py-1.5" aria-label="Conversation tools">
      <Button variant="ghost" size="sm" disabled={!recentCustomer} onClick={() => recentCustomer && onJump(recentCustomer.id)} aria-label="Latest customer message" className="min-h-10 gap-1.5 text-xs">
        <MessageSquare className="size-3.5" /> Last customer
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="sm" className="min-h-10 gap-1.5 text-xs"><Search className="size-3.5" /> Find in chat</Button>
        </SheetTrigger>
        <SheetContent className="flex flex-col gap-0 p-0 data-[side=right]:w-full sm:max-w-md">
          <SheetHeader className="border-b p-5">
            <SheetTitle>Find the context you need</SheetTitle>
            <SheetDescription>Search loaded messages and order numbers. Load older messages in the chat to include more history.</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 p-4">
            <Input aria-label="Search loaded messages" placeholder="Message or order number…" value={query} onChange={(event) => setQuery(event.target.value)} />
            <div className="flex flex-wrap gap-2" aria-label="Message filters">
              {[["all", "All"], ["customer", "Customer"], ["payments", "Payments & images"]].map(([value, label]) => (
                <Button key={value} size="sm" variant={filter === value ? "secondary" : "ghost"} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</Button>
              ))}
            </div>
            <p role="status" className="text-muted-foreground text-xs">{matches.length} matching loaded messages{matches.length > 80 ? " · showing newest 80" : ""}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
            {matches.slice(0, 80).map((message) => (
              <button key={message.id} type="button" className="admin-context-result hover:bg-muted focus-visible:ring-primary mb-2 block w-full rounded-xl border p-3 text-left focus-visible:ring-2" onClick={() => { setOpen(false); onJump(message.id); }}>
                <span className="text-muted-foreground flex items-center justify-between gap-2 text-[11px]">
                  <span>{message.senderRole === "customer" ? "Customer" : "Team"}{message.historyOrderNumber ? ` · ${message.historyOrderNumber}` : ""}</span>
                  <time dateTime={message.createdAt}>{timestamp.format(new Date(message.createdAt))}</time>
                </span>
                <span className="mt-2 line-clamp-3 block text-sm leading-relaxed">{message.body || (message.payment ? "Payment details" : message.album ? "Image attachment" : message.kind)}</span>
                {message.orderRef && <span className="text-primary mt-2 block text-xs">{message.orderRef}</span>}
              </button>
            ))}
            {!matches.length && <div className="text-muted-foreground py-12 text-center text-sm"><ReceiptText className="mx-auto mb-3 size-6" />No matching loaded messages. Try another phrase or filter.</div>}
          </div>
        </SheetContent>
      </Sheet>
      <Button variant="ghost" size="sm" className="ml-auto min-h-10 gap-1.5 text-xs" disabled={!canReply} onClick={onReply}><ArrowUpRight className="size-3.5" /> Reply</Button>
    </div>
  );
}
