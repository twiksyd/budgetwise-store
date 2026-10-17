// Strict parser for the Roblox gamepass links a customer pastes for a
// Robux (Via Link) order.
//
// Accepted (the two URLs a customer actually ends up with after following
// the gamepass tutorial, which finishes in Roblox's Creator Dashboard):
//   https://www.roblox.com/game-pass/<id>[/<slug>]        (public pass page)
//   https://www.roblox.com/<locale>/game-pass/<id>[/...]  (localised page)
//   https://roblox.com/game-pass/<id>[/...]
//   https://create.roblox.com/dashboard/creations/experiences/<universe>/passes/<id>[/...]
// The scheme may be omitted ("www.roblox.com/game-pass/123"). Query strings
// and fragments are dropped. Everything normalises to
//   https://www.roblox.com/game-pass/<id>
//
// Rejected: any other host (incl. lookalikes and subdomain tricks), other
// schemes (javascript:, data:, ...), credentials or ports in the URL,
// redirect-style paths, embedded whitespace/HTML characters, and ids that
// are not a positive integer.

export const CANONICAL_GAMEPASS_PREFIX = "https://www.roblox.com/game-pass/";
const MAX_INPUT_LENGTH = 500;
const PUBLIC_HOSTS = new Set(["www.roblox.com", "roblox.com"]);
const DASHBOARD_HOST = "create.roblox.com";
const GAMEPASS_ID_RE = /^[1-9][0-9]{0,19}$/;
const LOCALE_RE = /^[a-z]{2}(-[a-z]{2})?$/i;
const INVALID_MESSAGE =
  "Paste the link to your Roblox gamepass (e.g. https://www.roblox.com/game-pass/123456789).";

function fail() {
  return { ok: false, error: INVALID_MESSAGE };
}

export function parseRobloxGamepassUrl(input) {
  if (typeof input !== "string") return fail();

  let text = input.trim();
  if (text.length === 0 || text.length > MAX_INPUT_LENGTH) return fail();
  // No whitespace, quotes, angle brackets or backslashes anywhere: a real
  // pasted link never contains them, and they are how HTML/script and
  // parser-confusion payloads get in.
  if (/[\s<>"'`\\]/.test(text) || /[\x00-\x1f\x7f]/.test(text)) return fail();

  if (!/^https?:\/\//i.test(text)) {
    // Any other explicit scheme (javascript:, data:, ftp:, ...) is refused.
    if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return fail();
    text = `https://${text}`;
  }

  let url;
  try {
    url = new URL(text);
  } catch {
    return fail();
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return fail();
  if (url.username || url.password || url.port) return fail();

  // URL() lowercases and punycode-encodes the host, so unicode lookalikes
  // and case tricks cannot equal these exact strings.
  const host = url.hostname;
  const segments = url.pathname.split("/").filter(Boolean);
  let id = null;

  if (PUBLIC_HOSTS.has(host)) {
    let index = 0;
    if (
      segments[0] &&
      LOCALE_RE.test(segments[0]) &&
      segments[1]?.toLowerCase() === "game-pass"
    ) {
      index = 1;
    }
    if (segments[index]?.toLowerCase() !== "game-pass") return fail();
    id = segments[index + 1] ?? null;
  } else if (host === DASHBOARD_HOST) {
    if (
      segments[0] === "dashboard" &&
      segments[1] === "creations" &&
      segments[2] === "experiences" &&
      /^[0-9]+$/.test(segments[3] ?? "") &&
      segments[4] === "passes"
    ) {
      id = segments[5] ?? null;
    } else {
      return fail();
    }
  } else {
    return fail();
  }

  if (!id || !GAMEPASS_ID_RE.test(id)) return fail();

  return {
    ok: true,
    gamepassId: id,
    canonicalUrl: `${CANONICAL_GAMEPASS_PREFIX}${id}`,
  };
}

/** Short label for UI: "Gamepass #123456789". */
export function describeGamepass(gamepassId) {
  return `Gamepass #${gamepassId}`;
}
