/** The single, reviewed destination for every in-chat vouch request. */
export const VOUCH_FACEBOOK_URL = "https://www.facebook.com/share/p/1BiqWAJa36/";

/** Vouch cards contain no database-controlled URL or copy. */
export function toVouchRequest() {
  return { facebookUrl: VOUCH_FACEBOOK_URL };
}

export function hasVouchRequest(messages) {
  return (messages ?? []).some((message) => message?.kind === "vouch");
}
