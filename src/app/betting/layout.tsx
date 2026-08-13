import type { ReactNode } from "react";
import Link from "next/link";
import { getBettingUser } from "@/lib/betting/wallet";
import { fmtPoints } from "@/lib/betting/format";

/** Server-side gate for the whole /betting section: signed-out visitors get
 * a sign-in prompt (reusing /login's Discord flow, with a redirect back to
 * where they were headed); signed-in visitors without FPL Better access get
 * a plain "members only" message. Only an allowed visitor sees the nav +
 * balance chip + the page underneath. */
export default async function BettingLayout({ children }: { children: ReactNode }) {
  const user = await getBettingUser();

  if (!user) {
    return (
      <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">FPL Better</span>
        <h1 className="type-display text-3xl sm:text-4xl">Sign in to place bets</h1>
        <p className="max-w-md text-sm text-steel">
          The betting arena is a perk for FPL Better Discord members — sign in with Discord to check your access.
        </p>
        <Link href="/login?redirect=/betting" className="btn-pill mt-2">
          Sign in with Discord
        </Link>
      </main>
    );
  }

  if (!user.allowed) {
    return (
      <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">FPL Better</span>
        <h1 className="type-display text-3xl sm:text-4xl">FPL Better members only</h1>
        <p className="max-w-md text-sm text-steel">
          Betting is a perk for FPL Better Discord members. Join the FPL Better role in Discord and come back.
        </p>
      </main>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <nav className="border-b border-line bg-panel/60">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/betting" className="type-display text-lg not-italic text-white">
            Betting
          </Link>
          <div className="flex gap-4 text-sm text-steel">
            <Link href="/betting" className="hover:text-gold">
              Events
            </Link>
            <Link href="/betting/leaderboard" className="hover:text-gold">
              Leaderboard
            </Link>
            <Link href="/betting/profile" className="hover:text-gold">
              Profile
            </Link>
          </div>
          <span className="ml-auto rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-sm font-semibold text-gold">
            {fmtPoints(user.balance)}
          </span>
        </div>
      </nav>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
