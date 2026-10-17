// Runs uploads with bounded concurrency (2-3 at a time, never all at once)
// and reports "k of n" progress. Pure: the worker is injected.

/**
 * worker(item, index, onFileProgress(fraction)) -> Promise
 * onProgress({ completed, total, fraction }) after every change.
 * Resolves to [{ ok: true, value } | { ok: false, error }] in item order;
 * one failure never stops the others.
 */
export async function runUploadQueue(items, worker, { concurrency = 2, onProgress } = {}) {
  const total = items.length;
  const results = new Array(total);
  const partial = new Array(total).fill(0);
  let completed = 0;
  let next = 0;

  const report = () => {
    const fraction = total ? partial.reduce((sum, value) => sum + value, 0) / total : 1;
    onProgress?.({ completed, total, fraction });
  };

  async function lane() {
    while (next < total) {
      const index = next++;
      try {
        const value = await worker(items[index], index, (fraction) => {
          partial[index] = Math.max(0, Math.min(1, fraction));
          report();
        });
        results[index] = { ok: true, value };
      } catch (error) {
        results[index] = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      partial[index] = 1;
      completed += 1;
      report();
    }
  }

  const lanes = Array.from({ length: Math.max(1, Math.min(concurrency, total)) }, () => lane());
  await Promise.all(lanes);
  return results;
}

/** "Uploading 4 of 8…" */
export function uploadProgressText({ completed, total }) {
  if (!total) return "Sending…";
  if (completed >= total) return "Sending…";
  return `Uploading ${Math.min(completed + 1, total)} of ${total}…`;
}
