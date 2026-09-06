import Link from "next/link";

/**
 * The one sentence every gated cards page says when the viewer lacks the
 * role. There used to be two: pages that read the premium role said
 * "Premium members only", pages that read the wallet said "FPL Better
 * members only" — and both checks look at the same Discord role, so a
 * visitor bounced between two names for one thing.
 */
export const PREMIUM_GATE_TITLE = "Premium members only";
export const PREMIUM_GATE_BODY =
  "Cards are part of FPL Premium. Grab the premium role in the Discord and come back — card links you've been sent still work without it.";

/** The full-page refusal, in the shape every cards page already used. */
export default function CardsGate({
  section,
  title,
  body,
  signIn,
  browse,
}: {
  /** The eyebrow — which part of Cards this is. */
  section: string;
  title: string;
  body: string;
  /** Where to land after signing in; rendering the button at all means
   *  the viewer is signed out. */
  signIn?: string;
  /** The public way in — Browse is open to everyone, so a gate that only
   *  said "no" would be hiding the one door that is unlocked. */
  browse?: string;
}) {
  return (
    <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <span className="label-dash">{section}</span>
      <h1 className="type-display text-3xl sm:text-4xl">{title}</h1>
      <p className="max-w-md text-sm text-steel">{body}</p>
      {signIn ? (
        <Link href={`/login?redirect=${signIn}`} className="btn-pill mt-2">
          Sign in with Discord
        </Link>
      ) : null}
      {browse ? (
        <Link href={browse} className="text-sm text-action-text underline-offset-4 hover:underline">
          Or just browse the cards — every player, team and moment is open to everyone →
        </Link>
      ) : null}
    </main>
  );
}
