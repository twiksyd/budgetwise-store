// One checkout attempt's two unguessable credentials, generated in the
// browser and reused across retries of that same attempt.
//
//   idempotencyKey — the server/database key that makes retrying a checkout
//     resolve to the SAME logical order instead of creating a second one.
//   viewToken — the viewing credential for the resulting order slip. The
//     server stores only its SHA-256 digest.
//
// They are generated as a pair, and a retry must present the same pair: if
// the first request actually succeeded but its response was lost, the retry
// replays to the original order, and the success URL the browser then builds
// from its own token still opens that order.
//
// Persisted in sessionStorage against a signature of the order payload, so a
// reload mid-submit followed by a resubmit of the *same* cart still replays
// rather than duplicating, while a genuinely different cart always starts a
// fresh attempt. The slot is dropped once an attempt succeeds — re-adding
// the same items later is a new order, not a replay of the old one.
const STORAGE_KEY = "budgetwise-checkout-attempt";
const CREDENTIAL_BYTES = 32;

export interface CheckoutAttempt {
  idempotencyKey: string;
  viewToken: string;
}

export interface CheckoutSignatureInput {
  items: { gamepassId: string; quantity: number }[];
  contact: { name: string; robloxUsername: string };
  viaPlus?: {
    robloxDisplayName: string;
    age16Confirmed: boolean;
    verifiedAccountConfirmed: boolean;
  };
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createCredential() {
  const bytes = new Uint8Array(CREDENTIAL_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** Stable local description of what this attempt is ordering. */
export function buildCheckoutSignature(input: CheckoutSignatureInput) {
  const items = [...input.items]
    .map((item) => `${item.gamepassId}:${item.quantity}`)
    .sort();

  return JSON.stringify({
    items,
    // Trimmed to match how the server canonicalises contact details, so a
    // stray space typed before a retry does not look like a new attempt.
    contact: [input.contact.name.trim(), input.contact.robloxUsername.trim()],
    viaPlus: input.viaPlus
      ? [
          input.viaPlus.robloxDisplayName.trim(),
          input.viaPlus.age16Confirmed,
          input.viaPlus.verifiedAccountConfirmed,
        ]
      : null,
  });
}

function readStoredAttempt(signature: string): CheckoutAttempt | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const record = parsed as Record<string, unknown>;
    if (record.signature !== signature) return null;
    if (
      typeof record.idempotencyKey !== "string" ||
      typeof record.viewToken !== "string"
    ) {
      return null;
    }

    return {
      idempotencyKey: record.idempotencyKey,
      viewToken: record.viewToken,
    };
  } catch {
    return null;
  }
}

/**
 * The attempt for this exact payload: the stored one if this is a retry of
 * the same submission, otherwise a fresh pair.
 */
export function resolveCheckoutAttempt(signature: string): CheckoutAttempt {
  const stored = readStoredAttempt(signature);
  if (stored) return stored;

  const attempt: CheckoutAttempt = {
    idempotencyKey: createCredential(),
    viewToken: createCredential(),
  };

  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ signature, ...attempt }),
    );
  } catch {
    // Storage can be unavailable (private browsing, quota). The attempt
    // still works for this page's lifetime — only reload-then-resubmit
    // loses its replay protection, and the server key is still enforced.
  }

  return attempt;
}

export function clearCheckoutAttempt() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
