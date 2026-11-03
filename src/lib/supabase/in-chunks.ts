import "server-only";

// PostgREST takes `.in()` values in the URL, and the Supabase gateway
// rejects long URLs with a bare 400 "Bad Request". A few hundred UUIDs is
// already too many (the full catalog of ~650 products broke Product Assets
// and Store Operations), so lookups keyed by an unbounded ID list must be
// split into batches that each stay well under the limit.
const IN_FILTER_CHUNK_SIZE = 150;

interface ChunkResult<Row> {
  data: Row[] | null;
  error: { code?: string; message?: string } | null;
}

// Runs `query` once per batch of `ids` in parallel and concatenates the
// rows. Returns the first error instead of throwing, matching the
// `{ data, error }` shape callers already handle from a single query.
export async function selectInChunks<Row>(
  ids: readonly string[],
  query: (chunk: string[]) => PromiseLike<ChunkResult<Row>>,
): Promise<{ data: Row[]; error: ChunkResult<Row>["error"] }> {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += IN_FILTER_CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + IN_FILTER_CHUNK_SIZE));
  }

  const results = await Promise.all(chunks.map((chunk) => query(chunk)));
  const failed = results.find((result) => result.error);
  if (failed) return { data: [], error: failed.error };

  return { data: results.flatMap((result) => result.data ?? []), error: null };
}
