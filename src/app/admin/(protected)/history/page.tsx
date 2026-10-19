import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/order-chat.mjs";

type Review = { customer_id: string; customer_name: string; order_number: string; assigned_admin_id: string | null; state: string; needs_reply: boolean; home_key: string | null; customer_unread: number; admin_reads: { admin: string; name: string; unread: number }[]; eligibility: string; approved: boolean };
export default async function HistoryReview({ searchParams }: { searchParams: Promise<{ after?: string; customer?: string; offset?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const customer = isUuid(params.customer) ? params.customer : undefined;
  const after = isUuid(params.after) ? params.after : undefined;
  const offset = Math.min(Math.max(Math.floor(Number(params.offset) || 0), 0), 100000);
  const { data, error } = await createAdminClient().rpc("store_history_review", { ...(customer ? { p_customer: customer } : {}), ...(after ? { p_after: after } : {}), p_offset: offset });
  if (error) throw new Error("Historical review unavailable. Verify migration 0036 is installed.");
  const rows = (data ?? []) as unknown as Review[];
  const groups = new Map<string, Review[]>();
  for (const row of rows) groups.set(row.customer_id, [...(groups.get(row.customer_id) ?? []), row]);
  const lastCustomer = rows.at(-1)?.customer_id;
  return <section className="space-y-6">
    <div><h1 className="font-heading text-2xl font-semibold">Historical chat review</h1><p className="text-muted-foreground mt-2 text-sm">Verified customer accounts only. Reviewing this metadata leaves all unread indicators unchanged. Linking requires explicit operator approval.</p></div>
    {!rows.length && <p className="text-muted-foreground">No historical chats on this page.</p>}
    {[...groups].map(([id, chats]) => <section key={id} className="border-border rounded-2xl border p-4 sm:p-6">
      <h2 className="text-sm font-semibold">{chats[0].customer_name}</h2>
      <p className="text-muted-foreground mt-1 break-all text-xs">Verified account · {id}</p>
      <p className="text-muted-foreground mt-1 text-xs">{chats[0].home_key ?? "Unified identity needs initialization"}</p>
      <ul className="mt-4 divide-y">{chats.map((chat) => <li key={chat.order_number} className="space-y-2 py-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{chat.order_number}</span><span className="bg-muted rounded-full px-3 py-1 text-xs">{chat.state === "done" ? "Done" : chat.needs_reply ? "Needs Reply" : "Active · answered"}</span></div>
        <p className="text-muted-foreground text-xs">Assigned: {chat.admin_reads.find((a) => a.admin === chat.assigned_admin_id)?.name ?? chat.assigned_admin_id ?? "Unassigned"} · Customer unread: {chat.customer_unread}</p>
        <div className="flex flex-wrap gap-2">{chat.admin_reads.map((a) => <span key={a.admin} className="bg-muted/50 rounded-lg px-2 py-1 text-xs">{a.name}: {a.unread} unread</span>)}</div>
        <p className="text-xs">{chat.eligibility}{chat.approved ? " · Scoped approval present" : ""}</p>
        <Link className="text-primary inline-block rounded py-2 text-xs underline underline-offset-4" href={`/admin/orders/${encodeURIComponent(chat.order_number)}`} prefetch={false}>Open existing workflow (normal read behavior)</Link>
      </li>)}</ul>
      {chats.length === 50 && <Link className="text-primary mt-3 inline-block text-sm underline" href={`/admin/history?customer=${id}&offset=${offset + 50}`}>Next orders for this customer</Link>}
    </section>)}
    <div className="flex flex-wrap gap-4 text-sm"><Link href="/admin/history" className="underline">Start over</Link>{!customer && lastCustomer && groups.size === 20 && <Link className="text-primary underline" href={`/admin/history?after=${lastCustomer}`}>Next customers</Link>}</div>
  </section>;
}
