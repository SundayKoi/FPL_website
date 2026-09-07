// Where the Discord is.
//
// Eleven walls used to say "grab the premium role in the Discord" and not
// one of them linked to it — the string for an invite did not exist in the
// codebase. This is the one place it lives. Set NEXT_PUBLIC_DISCORD_INVITE_URL
// in the environment (Vercel → Settings → Environment Variables); until it
// is set, the button falls back to the league links page, which is at least
// a page a person can act from rather than a sentence they cannot.

export const DISCORD_INVITE_URL: string = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL?.trim() || "/league-links";

/** Whether the invite is a real external link (opens in a new tab) or the
 *  in-site fallback. */
export const DISCORD_INVITE_EXTERNAL = DISCORD_INVITE_URL.startsWith("http");

/** The name of the thing every wall is asking for. One product, one name:
 *  it was "FPL Premium" on one wall and "FPL Better" on the next, and both
 *  meant the same Discord role. */
export const PREMIUM_NAME = "FPL Premium";
