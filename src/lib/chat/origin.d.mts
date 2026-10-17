export function isSameOrigin(input: {
  origin: string | null;
  host: string | null;
  forwardedHost: string | null;
  requestUrl: string;
}): boolean;
