// CSRF guard for cookie-authenticated writes. Browsers always send Origin
// on cross-site POST/PUT/PATCH; when present it must match the host the
// browser actually addressed. Host / X-Forwarded-Host are checked because
// request.url can carry an internal hostname (proxies, `next dev`).
export function isSameOrigin({ origin, host, forwardedHost, requestUrl }) {
  if (!origin) return true;
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  let urlHost = null;
  try {
    urlHost = new URL(requestUrl).host;
  } catch {
    urlHost = null;
  }
  const candidates = [forwardedHost?.split(",")[0]?.trim(), host, urlHost];
  return candidates.some((candidate) => Boolean(candidate) && candidate === originHost);
}
