// One-time announcement: tell every customer who has an on-site chat that
// BudgetWise now talks on Messenger (BudgetWise DGM), with the link.
//
//   PREVIEW (default, changes nothing):
//     node --env-file=.env.local scripts/announce-messenger.mjs
//   SEND (posts the message, as that admin, once per customer):
//     node --env-file=.env.local scripts/announce-messenger.mjs --send --admin=<admin user id>
//
// One message per customer: into their customer conversation (General
// Inquiry thread) if they have one, else their most recently active order
// chat. Safe to re-run: each conversation gets a fixed client message id,
// so a second run posts nothing new. Never touches orders, payments, XOB,
// unread cursors of admins, assignments or Done states.
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const ANNOUNCEMENT = [
  "Hi! BudgetWise has moved to Messenger 🎉",
  "",
  "For new orders, questions and updates, please message our new page BudgetWise DGM:",
  "https://m.me/1472889109233950",
  "",
  "Your chat history here stays available to view. Thank you for ordering with us!",
].join("\n");

const CAMPAIGN = "messenger-move-2026-10";

/** Deterministic uuid for (campaign, conversation): re-runs are no-ops. */
export function announcementClientId(key) {
  const hex = createHash("sha256").update(`${CAMPAIGN}:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function main() {
  const send = process.argv.includes("--send");
  const adminArg = process.argv.find((arg) => arg.startsWith("--admin="))?.slice("--admin=".length) ?? null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env (run with --env-file=.env.local).");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const page = async (table, columns) => {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) return rows;
    }
  };

  const [conversations, threads, admins] = await Promise.all([
    page("store_order_conversations", "order_number, last_message_at, state"),
    page("store_chat_threads", "key, kind, owner_user_id"),
    supabase.from("admin_users").select("user_id, public_username, display_name"),
  ]);
  if (admins.error) throw admins.error;
  const threadByKey = new Map(threads.map((row) => [row.key, row]));
  const orderKeys = conversations.map((row) => row.order_number).filter((k) => threadByKey.get(k)?.kind === "order");
  const owners = new Map();
  for (let i = 0; i < orderKeys.length; i += 200) {
    const { data, error } = await supabase
      .from("store_order_snapshots")
      .select("order_number, owner_user_id")
      .in("order_number", orderKeys.slice(i, i + 200));
    if (error) throw error;
    for (const row of data ?? []) owners.set(row.order_number, row.owner_user_id);
  }

  // One target per customer: their customer conversation, else latest order chat.
  const byCustomer = new Map();
  for (const conversation of conversations) {
    const thread = threadByKey.get(conversation.order_number);
    const owner = thread?.kind === "inquiry" ? thread.owner_user_id : owners.get(conversation.order_number);
    if (!owner) continue; // old guest orders: no account to reach
    const current = byCustomer.get(owner);
    const isInquiry = thread?.kind === "inquiry";
    const better =
      !current ||
      (isInquiry && !current.isInquiry) ||
      (isInquiry === current.isInquiry && conversation.last_message_at > current.lastMessageAt);
    if (better) byCustomer.set(owner, { key: conversation.order_number, isInquiry, lastMessageAt: conversation.last_message_at });
  }
  const targets = [...byCustomer.values()];

  console.log(`Conversations: ${conversations.length} · customers to message: ${targets.length}`);
  console.log(`  into customer conversations: ${targets.filter((t) => t.isInquiry).length} · into order chats: ${targets.filter((t) => !t.isInquiry).length}`);
  console.log("\nMessage:\n-----\n" + ANNOUNCEMENT + "\n-----");
  console.log("\nAdmins (customers see the public username):");
  for (const admin of admins.data ?? []) console.log(`  ${admin.user_id}  public: ${admin.public_username ?? "BudgetWise"}  (${admin.display_name ?? "-"})`);

  if (!send) {
    console.log("\nPREVIEW ONLY — nothing was sent. Re-run with --send --admin=<admin user id> to send.");
    return;
  }
  if (!adminArg || !(admins.data ?? []).some((admin) => admin.user_id === adminArg)) {
    throw new Error("--admin must be one of the admin user ids listed above.");
  }

  let created = 0;
  let already = 0;
  const failed = [];
  for (const target of targets) {
    const { data, error } = await supabase.rpc("store_post_message", {
      p_order_number: target.key,
      p_sender_role: "admin",
      p_sender: adminArg,
      p_kind: "text",
      p_body: ANNOUNCEMENT,
      p_attachment_path: null,
      p_attachment_mime: null,
      p_client_message_id: announcementClientId(target.key),
    });
    if (error) failed.push(`${target.key}: ${error.code ?? ""} ${error.message}`);
    else if (data?.created) created += 1;
    else already += 1;
  }
  console.log(`\nSent: ${created} · already sent before: ${already} · failed: ${failed.length}`);
  for (const line of failed) console.log(`  FAILED ${line}`);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/").replace(/^(?=[A-Za-z]:)/, "/")}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
