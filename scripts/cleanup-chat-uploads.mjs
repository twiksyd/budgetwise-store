// Deletes abandoned chat uploads (files no message references, older than
// the retention window). Manual, on purpose: nothing schedules this.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/cleanup-chat-uploads.mjs
//       -> dry run: prints how many files would be removed
//   ... node scripts/cleanup-chat-uploads.mjs --delete [--hours 24]
//       -> removes them through the Storage API
//
// Non-local projects also need --project-ref <ref> matching the URL, so a
// copied command cannot hit the wrong project.
import { createClient } from "@supabase/supabase-js";
import { cleanupOrphanUploads, ORPHAN_RETENTION_HOURS } from "../src/lib/chat/upload-cleanup.mjs";

const BUCKET = "order-chat-attachments";
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(2);
}
const isLocal = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url);
if (!isLocal) {
  const ref = value("--project-ref");
  if (!ref || !url.includes(`://${ref}.`)) {
    console.error("Refusing: a non-local project needs --project-ref <ref> matching SUPABASE_URL.");
    process.exit(2);
  }
}

const hours = Number(value("--hours") ?? ORPHAN_RETENTION_HOURS);
const dryRun = !flag("--delete");
const supabase = createClient(url, key, { auth: { persistSession: false } });

const result = await cleanupOrphanUploads({
  olderThanHours: hours,
  dryRun,
  list: async (olderThanHours, limit) => {
    const { data, error } = await supabase.rpc("store_list_orphan_chat_uploads", {
      p_older_than_hours: olderThanHours,
      p_limit: limit,
    });
    if (error) throw error;
    return data ?? [];
  },
  remove: async (names) => {
    const { error } = await supabase.storage.from(BUCKET).remove(names);
    if (error) throw error;
  },
});

console.log(
  dryRun
    ? `Dry run: ${result.listed} abandoned upload(s) older than ${Math.max(hours, 12)} h would be removed (first page). Re-run with --delete.`
    : `Removed ${result.removed} abandoned upload(s) in ${result.batches} batch(es).`,
);
