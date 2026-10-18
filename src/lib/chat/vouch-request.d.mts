export const VOUCH_FACEBOOK_URL: "https://www.facebook.com/share/p/1BiqWAJa36/";
export interface VouchRequestDto {
  facebookUrl: typeof VOUCH_FACEBOOK_URL;
}
export function toVouchRequest(): VouchRequestDto;
export function hasVouchRequest(messages: Array<{ kind?: string } | null | undefined> | null | undefined): boolean;
