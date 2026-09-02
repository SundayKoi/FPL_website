// The market's dials, in one file.
//
// Same discipline as src/lib/packs/config.ts and src/lib/expeditions/config.ts:
// every number a human might want to change lives here as a named constant, and
// nothing else is allowed to restate one. Where SQL has to restate one anyway —
// a CHECK constraint cannot import TypeScript — config.test.ts reads the
// migration and asserts the two agree, because a limit written twice drifts and
// the drift is always discovered by a user hitting the smaller of the two.
//
// Directive-free on purpose: this is imported by server actions AND by client
// components (the forms need to know the caps to say so before you submit), so
// it must be safe to put in a browser bundle. It holds no secrets and reaches
// no database.

/**
 * Most a copy may be listed for. Matched to trades' MAX_TRADE_DOLLARS
 * (src/lib/trades/actions.ts) rather than picked fresh — a listing is a trade
 * with one side pre-agreed, and a ceiling that differed between the two would
 * just tell people which screen to use to move a fortune.
 *
 * A ceiling, not a balance check: the RPC is the only thing that knows what a
 * wallet actually holds.
 */
export const MAX_LISTING_ASK = 100_000;

/** Most a want may put up as a bounty. Same number for the same reason — the
 *  two boards are one market seen from either side. */
export const MAX_WANT_BOUNTY = 100_000;

/**
 * How long a listing stands before it lapses.
 *
 * Long enough that a listing posted on a Tuesday survives the fortnight nobody
 * logs in, short enough that the board is a picture of what is for sale NOW
 * rather than an archive of everything anyone ever thought about selling. The
 * database writes the same fourteen days as `expires_at`'s default.
 */
export const LISTING_DAYS = 14;

/**
 * How many listings one collector may have open at once.
 *
 * Not a scarcity rule — it is an anti-wallpaper rule. Ten is comfortably more
 * than anyone selling duplicates needs, and few enough that one person cannot
 * make the board entirely their own shelf.
 */
export const MAX_OPEN_LISTINGS = 10;

/** How many wants one collector may have open at once. Lower than listings
 *  because a want is a promise to pay: five open bounties against one wallet
 *  is already more than most balances can honour. */
export const MAX_OPEN_WANTS = 5;

/** Longest note either board carries. A note is a sentence — "will take
 *  offers", "need it for the Vipers set" — not a sales pitch. */
export const MAX_NOTE_CHARS = 80;

/** A whole-number price inside the allowed band. Shared by both boards'
 *  validation so "1 to the cap, integers only" is written once. */
export function validPrice(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max;
}

/** A note trimmed to what the database will accept, or null for an empty one.
 *  Returns undefined when the input is over the limit, which callers refuse. */
export function normalizeNote(raw: unknown): string | null | undefined {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.length > MAX_NOTE_CHARS) return undefined;
  return trimmed;
}
