// Removes chat uploads that no message references (an album that was
// cancelled, abandoned when the tab closed, or never posted). Pure: the
// listing (store_list_orphan_chat_uploads) and the Storage API removal are
// injected, so it runs the same from a script, a route or a test.
//
// Safety comes from the database: it only lists files at least 12 hours
// old, and albums only accept files uploaded in the last 6 hours, so a
// file listed here can never become part of a message afterwards.

export const ORPHAN_RETENTION_HOURS = 24;
const BATCH_SIZE = 500;
const MAX_BATCHES = 20;

/**
 * list(olderThanHours, limit) -> [{ name, created_at }]
 * remove(names) -> void (Storage API; throws on failure)
 * Resolves { listed, removed, batches, dryRun }.
 */
export async function cleanupOrphanUploads({
  list,
  remove,
  olderThanHours = ORPHAN_RETENTION_HOURS,
  batchSize = BATCH_SIZE,
  maxBatches = MAX_BATCHES,
  dryRun = false,
}) {
  let listed = 0;
  let removed = 0;
  let batches = 0;
  const seen = new Set();
  while (batches < maxBatches) {
    const rows = await list(olderThanHours, batchSize);
    const names = rows.map((row) => row.name).filter((name) => typeof name === "string" && !seen.has(name));
    if (names.length === 0) break;
    batches += 1;
    listed += names.length;
    for (const name of names) seen.add(name);
    // A dry run deletes nothing, so the next listing would repeat this page.
    if (dryRun) break;
    await remove(names);
    removed += names.length;
    if (rows.length < batchSize) break;
  }
  return { listed, removed, batches, dryRun };
}
