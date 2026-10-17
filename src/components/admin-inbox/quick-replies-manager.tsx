"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchJson, jsonInit, RequestError } from "@/lib/chat/client/fetch-json";
import { cn } from "@/lib/utils";

interface QuickReply {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  isEnabled: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const DATE = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

export function QuickRepliesManager({
  initialReplies,
  directory,
}: {
  initialReplies: QuickReply[];
  directory: Record<string, string>;
}) {
  const [replies, setReplies] = useState(initialReplies);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<QuickReply | "new" | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^\//, "");
    if (!q) return replies;
    return replies.filter(
      (reply) =>
        reply.shortcut.includes(q) || reply.title.toLowerCase().includes(q) || reply.body.toLowerCase().includes(q),
    );
  }, [replies, search]);

  function upsert(reply: QuickReply) {
    setReplies((current) =>
      [...current.filter((item) => item.id !== reply.id), reply].sort((a, b) => a.shortcut.localeCompare(b.shortcut)),
    );
  }

  async function toggle(reply: QuickReply) {
    try {
      const body = await fetchJson<{ reply: QuickReply }>(
        `/api/admin/quick-replies/${reply.id}`,
        jsonInit("PATCH", { ...reply, isEnabled: !reply.isEnabled }),
      );
      upsert(body.reply);
    } catch (error) {
      toast.error(error instanceof RequestError ? error.message : "Could not update.");
    }
  }

  const name = (id: string | null) => (id ? (directory[id] ?? "Admin") : "—");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search quick replies</span>
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search shortcut, title or message"
            className="border-input h-10 w-full rounded-lg border pr-3 pl-9 text-sm"
          />
        </label>
        <Button type="button" onClick={() => setEditing("new")} className="h-10">
          <Plus className="size-4" /> New quick reply
        </Button>
      </div>

      {editing && (
        <QuickReplyForm
          reply={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(reply) => {
            upsert(reply);
            setEditing(null);
            toast.success(`Saved /${reply.shortcut}`);
          }}
        />
      )}

      {filtered.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
          {replies.length === 0 ? "No quick replies yet." : "No matches."}
        </p>
      ) : (
        <ul className="divide-border/60 divide-y rounded-xl border">
          {filtered.map((reply) => (
            <li key={reply.id} className={cn("flex flex-col gap-2 p-3.5 sm:flex-row sm:items-start", !reply.isEnabled && "opacity-60")}>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="text-primary font-mono font-semibold">/{reply.shortcut}</span>
                  <span className="font-semibold"> · {reply.title}</span>
                  {!reply.isEnabled && <span className="text-muted-foreground ml-2 text-xs font-semibold">Disabled</span>}
                </p>
                <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">{reply.body}</p>
                <p className="text-muted-foreground mt-1.5 text-[11px]">
                  Created by {name(reply.createdBy)} · {DATE.format(new Date(reply.createdAt))} — updated by {name(reply.updatedBy)} ·{" "}
                  {DATE.format(new Date(reply.updatedAt))}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(reply)}>
                  Edit
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void toggle(reply)}>
                  {reply.isEnabled ? "Disable" : "Enable"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuickReplyForm({
  reply,
  onCancel,
  onSaved,
}: {
  reply: QuickReply | null;
  onCancel: () => void;
  onSaved: (reply: QuickReply) => void;
}) {
  const [shortcut, setShortcut] = useState(reply?.shortcut ?? "");
  const [title, setTitle] = useState(reply?.title ?? "");
  const [body, setBody] = useState(reply?.body ?? "");
  const [isEnabled, setIsEnabled] = useState(reply?.isEnabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { shortcut, title, body, isEnabled };
      const result = reply
        ? await fetchJson<{ reply: QuickReply }>(`/api/admin/quick-replies/${reply.id}`, jsonInit("PATCH", payload))
        : await fetchJson<{ reply: QuickReply }>("/api/admin/quick-replies", jsonInit("POST", payload));
      onSaved(result.reply);
    } catch (caught) {
      setError(caught instanceof RequestError ? caught.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="surface-premium space-y-3 rounded-xl p-4">
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <label className="block text-xs font-semibold">
          Shortcut
          <div className="border-input mt-1 flex h-10 items-center rounded-lg border px-2.5">
            <span className="text-muted-foreground">/</span>
            <input
              value={shortcut}
              onChange={(event) => setShortcut(event.target.value.toLowerCase().replace(/^\//, ""))}
              maxLength={32}
              placeholder="was"
              className="h-full flex-1 bg-transparent font-mono text-sm outline-none"
              required
            />
          </div>
        </label>
        <label className="block text-xs font-semibold">
          Title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={80}
            placeholder="Payment received"
            className="border-input mt-1 h-10 w-full rounded-lg border px-2.5 text-sm"
            required
          />
        </label>
      </div>
      <label className="block text-xs font-semibold">
        Message
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Payment received po! Kindly accept my friend request."
          className="border-input mt-1 w-full rounded-lg border px-2.5 py-2 text-sm"
          required
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isEnabled} onChange={(event) => setIsEnabled(event.target.checked)} className="accent-primary size-4" />
        Enabled
      </label>
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
