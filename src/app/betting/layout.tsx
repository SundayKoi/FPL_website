import type { ReactNode } from "react";
import Link from "next/link";
import AccessWall from "@/components/access/AccessWall";
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
      <AccessWall
        section="Betting"
        reason="signed-out"
        redirect="/betting"
        title="Sign in to place bets"
        body="Betting dollars, the markets and the pick'em ride on your Discord account — sign in to check your access."
      />
    );
  }
  if (!user.allowed) {
    return (
      <AccessWall
        section="Betting"
        reason="no-role"
        redirect="/betting"
        body="Betting is part of FPL Premium — the Discord role that opens the wallet, the cards and the games. Join the Discord, grab the role, and sign in again."
      />
    );
  }
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6">
        <PremiumBackLink />
      </div>
      <nav className="border-b border-border-subtle bg-surface/60">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/betting" className="type-display text-lg not-italic text-white">
            Betting
          </Link>
          <div className="flex gap-4 text-sm text-muted">
            <Link href="/betting" className="hover:text-action-text">
              Events
            </Link>
            <Link href="/betting/leaderboard" className="hover:text-action-text">
              Leaderboard
            </Link>
            <Link href="/betting/profile" className="hover:text-action-text">
              Profile
            </Link>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {user.staff && (
              <Link
                href="/admin/betting"
                className="rounded-full border border-border-strong px-3 py-1 text-sm text-muted transition hover:border-action-text/40 hover:text-action-text"
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
