// Shared shape and validation for the one-time signing links.
//
// Framework-free so the server actions and the tests both import it.

/** Matches SignaturePad's export and card_art_prefs' column check
 *  (20260826000016): a small transparent PNG as a data URL. */
export const MAX_SIGNATURE_CHARS = 80000;

/**
 * The only thing a signing link may write: a PNG data URL under the size
 * cap. The token authorizes WHO — this guards WHAT, because the submit
 * action takes the payload from an unauthenticated page and card_art_prefs
 * is rendered back as an <img src> on real cards.
 */
export function validSignatureDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_SIGNATURE_CHARS &&
    /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value)
  );
}

export interface SignatureInvite {
  token: string;
  season: string;
  summonerName: string;
  tag: string;
  displayName: string;
  expiresAt: string;
  usedAt: string | null;
}

/** How long a signing link lives. Two weeks: long enough for someone who
 *  checks Discord weekly, short enough that a leaked link dies. */
export const INVITE_DAYS = 14;

/** Whether an invite's clock has run out — reads the wall clock, so
 *  server components call this instead of Date.now() in render. */
export function inviteExpired(expiresAt: string): boolean {
  const at = new Date(expiresAt).getTime();
  // NaN comparisons are all false, which would read "unparseable" as
  // "live forever" — fail closed instead.
  return !Number.isFinite(at) || at <= Date.now();
}
