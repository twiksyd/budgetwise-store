import openNextWorker, {
  DOQueueHandler,
  DOShardedTagCache,
  BucketCachePurge,
} from "./.open-next/worker.js";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge };

const PUBLIC_HTML_PATHS = new Set(["/", "/games"]);
const PUBLIC_HTML_TTL_SECONDS = 30;

function isCacheableRequest(request, pathname) {
  if (request.method !== "GET" || !PUBLIC_HTML_PATHS.has(pathname)) return false;
  if (request.headers.has("cookie") || request.headers.has("authorization")) return false;
  if (request.headers.has("rsc") || request.headers.has("next-router-state-tree")) return false;
  if (request.headers.has("next-router-prefetch")) return false;
  return request.headers.get("accept")?.includes("text/html") ?? false;
}

function createCacheKey(request) {
  const url = new URL(request.url);
  // The two public pages do not read search parameters. Keeping the original
  // URL in the browser preserves campaign attribution while sharing HTML.
  url.search = "";
  return new Request(url, { method: "GET" });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!isCacheableRequest(request, url.pathname)) {
      return openNextWorker.fetch(request, env, ctx);
    }

    const cache = caches.default;
    const key = createCacheKey(request);
    try {
      const cached = await cache.match(key);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("x-budgetwise-edge-cache", "HIT");
        return new Response(cached.body, {
          status: cached.status,
          statusText: cached.statusText,
          headers,
        });
      }
    } catch {
      return openNextWorker.fetch(request, env, ctx);
    }

    const response = await openNextWorker.fetch(request, env, ctx);
    try {
      const contentType = response.headers.get("content-type") ?? "";
      const nextCache = response.headers.get("x-nextjs-cache");
      const cacheControl = response.headers.get("cache-control") ?? "";
      if (
        response.status === 200 &&
        contentType.includes("text/html") &&
        nextCache !== "STALE" &&
        !cacheControl.includes("private") &&
        !response.headers.has("set-cookie")
      ) {
        const cacheHeaders = new Headers(response.headers);
        cacheHeaders.set(
          "cache-control",
          `public, max-age=0, s-maxage=${PUBLIC_HTML_TTL_SECONDS}`,
        );
        const cachedResponse = new Response(response.clone().body, {
          status: response.status,
          statusText: response.statusText,
          headers: cacheHeaders,
        });
        await cache.put(key, cachedResponse);
      }
    } catch {
      // Cache API failures must never take down the storefront.
    }

    const headers = new Headers(response.headers);
    headers.set("x-budgetwise-edge-cache", "MISS");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
