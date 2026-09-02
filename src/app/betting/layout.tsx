import type { ReactNode } from "react";
import Link from "next/link";
import PremiumBackLink from "@/components/premium/PremiumBackLink";
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
      <div className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6">
          <PremiumBackLink />
        </div>
        <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
          <span className="label-dash">FPL Better</span>
          <h1 className="type-display text-3xl sm:text-4xl">Sign in to place bets</h1>
          <p className="max-w-md text-sm text-muted">
            The betting arena is a perk for FPL Better Discord members — sign in with Discord to check your access.
          </p>
          <Link href="/login?redirect=/betting" className="btn-pill mt-2">
            Sign in with Discord
          </Link>
        </main>
      </div>
    );
  }

  if (!user.allowed) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6">
          <PremiumBackLink />
        </div>
        <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
          <span className="label-dash">FPL Better</span>
          <h1 className="type-display text-3xl sm:text-4xl">FPL Better members only</h1>
          <p className="max-w-md text-sm text-muted">
            Betting is a perk for FPL Better Discord members. Join the FPL Better role in Discord and come back.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6">
        <PremiumBackLink />
      </div>
      <nav className="border-b border-border bg-surface/60">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/betting" className="type-display text-lg not-italic text-white">
            Betting
          </Link>
          <div className="flex gap-4 text-sm text-muted">
            <Link href="/betting" className="hover:text-primary">
              Events
            </Link>
            <Link href="/betting/leaderboard" className="hover:text-primary">
              Leaderboard
            </Link>
            <Link href="/betting/profile" className="hover:text-primary">
              Profile
            </Link>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {user.staff && (
              <Link
                href="/admin/betting"
                className="rounded-full border border-border px-3 py-1 text-sm text-muted transition hover:border-primary/40 hover:text-primary"
              >
                Admin
              </Link>
            )}
            <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-sm font-semibold text-gold">
              {fmtPoints(user.balance)}
            </span>
          </div>
        </div>
      </nav>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
