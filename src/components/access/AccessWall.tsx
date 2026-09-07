import Link from "next/link";
import { DISCORD_INVITE_EXTERNAL, DISCORD_INVITE_URL, PREMIUM_NAME } from "@/lib/site/discord";

/**
 * The one wall every gated page shows.
 *
 * There used to be nine of them, hand-rolled, and they disagreed about the
 * product's name, whether to offer a sign-in button, and — on seven pages —
 * whether to offer anything at all: a signed-in non-member on Betting,
 * Packs or Trades reached a sentence and stopped. This wall always has a
 * next step, in the same order everywhere:
 *
 *   signed out   → Sign in with Discord (back to where they were going)
 *   no role      → Join the Discord · Get FPL Premium · and, on a cards
 *                  page, the public Browse door that was always open
 *
 * `reason` is what the page knows; the wall says the rest. Server-renderable
 * — no hooks — so a layout can return it.
 */
export type AccessReason = "signed-out" | "no-role" | "lapsed";

export const PREMIUM_GATE_TITLE = `${PREMIUM_NAME} members only`;

export default function AccessWall({
  section,
  reason,
  redirect,
  title,
  body,
  browse,
  browseLabel = "Or just browse the cards — every player, team and moment is open to everyone →",
  note,
}: {
  /** The eyebrow — which part of the site this is. */
  section: string;
  reason: AccessReason;
  /** Where to land after signing in — the page the visitor was headed for. */
  redirect: string;
  /** Overrides for the heading and the sentence under it; the defaults say
   *  the true thing for the reason. */
  title?: string;
  body?: string;
  /** The public way in, when the section has one (Browse). */
  browse?: string;
  browseLabel?: string;
  /** One more line under the buttons — "your cards are safe", "draft links
   *  you've been sent still work". */
  note?: string;
}) {
  const signedOut = reason === "signed-out";
  const heading =
    title ?? (signedOut ? "Sign in to see this" : reason === "lapsed" ? `Your ${PREMIUM_NAME} has lapsed` : PREMIUM_GATE_TITLE);
  const line =
    body ??
    (signedOut
      ? `This part of the site is for ${PREMIUM_NAME} members. Sign in with Discord to check your access.`
      : reason === "lapsed"
        ? `Everything you own is still here. Get ${PREMIUM_NAME} back and it opens again exactly as you left it.`
        : `${PREMIUM_NAME} is the Discord role that opens the cards, the wallet and the games. Join the Discord, grab the role, and sign in again.`);
  return (
    <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center" data-testid="access-wall" data-reason={reason}>
      <span className="label-dash">{section}</span>
      <h1 className="type-display text-3xl sm:text-4xl">{heading}</h1>
      <p className="max-w-md text-sm text-steel">{line}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        {signedOut ? (
          <Link href={`/login?redirect=${redirect}`} className="btn-primary px-5 py-3 text-sm uppercase tracking-wide">
            Sign in with Discord
          </Link>
        ) : (
          <>
            {DISCORD_INVITE_EXTERNAL ? (
              <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="btn-primary px-5 py-3 text-sm uppercase tracking-wide">
                Join the Discord ↗
              </a>
            ) : (
              <Link href={DISCORD_INVITE_URL} className="btn-primary px-5 py-3 text-sm uppercase tracking-wide">
                Find the Discord
              </Link>
            )}
            {/* The membership page, not the Premium HQ gate: it says what the
                role costs, what patronage is, and how to get either — the
                gate only sells one of them. */}
            <Link href="/membership" className="btn-pill text-sm">
              {reason === "lapsed" ? `Get ${PREMIUM_NAME} back` : `What ${PREMIUM_NAME} is`}
            </Link>
          </>
        )}
      </div>
      {note ? <p className="max-w-md text-xs text-muted">{note}</p> : null}
      {browse ? (
        <Link href={browse} className="text-sm text-action-text underline-offset-4 hover:underline">
          {browseLabel}
        </Link>
      ) : null}
    </main>
  );
}
