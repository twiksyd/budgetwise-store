export const CHECKOUT_CREDENTIAL_BYTES: number;
export const CHECKOUT_CREDENTIAL_PATTERN: RegExp;

export function isCheckoutCredentialFormatValid(value: unknown): boolean;
export function createCheckoutCredential(): string;
export function hashViewToken(token: string): string;
export function viewTokenMatchesHash(
  token: string | null | undefined,
  storedHash: string | null | undefined,
): boolean;

export function authorizeOrderSlip(input: {
  orderReference: string;
  snapshot: { order_number: string; view_token_hash: string } | null;
  viewToken: string | null | undefined;
}): boolean;

export function fingerprintOrderRequest(input: {
  items: { gamepassId: string; quantity: number }[];
  contact: { name: string; robloxUsername: string };
  viaPlus?:
    | {
        robloxDisplayName: string;
        age16Confirmed: boolean;
        verifiedAccountConfirmed: boolean;
      }
    | undefined;
}): string;
