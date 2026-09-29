import type { ReactNode } from "react";
import Link from "next/link";
import AccessWall from "@/components/access/AccessWall";
import BettingSectionNav from "@/components/play/BettingSectionNav";
import PlayPageShell from "@/components/play/PlayPageShell";
import { getBettingUser } from "@/lib/betting/wallet";

/** Server-side gate for the whole /betting section. The Play shell is shared
 * across access states; wallet data only reaches authorized page content. */
export default async function BettingLayout({ children }: { children: ReactNode }) {
  const user = await getBettingUser();

  if (!user) {
    return (
      <PlayPageShell league="premier" active="betting">
        <AccessWall
          section="Betting"
          reason="signed-out"
          redirect="/betting"
          title="Sign in to place bets"
          body="Betting dollars, the markets and the pick'em ride on your Discord account — sign in to check your access."
        />
      </PlayPageShell>
    );
  }
  if (!user.allowed) {
    return (
      <PlayPageShell league="premier" active="betting">
        <AccessWall
          section="Betting"
          reason="no-role"
          redirect="/betting"
          body="Betting is part of FPL Premium — the Discord role that opens the wallet, the cards and the games. Join the Discord, grab the role, and sign in again."
        />
      </PlayPageShell>
    );
  }

  return (
    <PlayPageShell league="premier" active="betting">
      <div className="flex flex-1 flex-col">
        <header className="border-b border-border-subtle bg-surface/60">
          <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-wrap items-center gap-x-8 gap-y-3 pt-5" data-page-container style={{ paddingInline: "var(--page-gutter)" }}>
            <div className="mr-auto min-w-0">
              <Link href="/betting" className="type-display text-xl text-white">Betting</Link>
              <p className="mt-1 text-xs text-muted">Markets and pick&apos;em for every event</p>
            </div>
            <div className="flex items-center gap-3">
              {user.staff ? (
                <Link href="/admin/betting" className="rounded border border-border-strong px-3 py-2 text-xs font-semibold text-muted transition hover:border-action-text hover:text-action-text">Admin</Link>
              ) : null}
            </div>
            <div className="w-full">
              <BettingSectionNav />
            </div>
          </div>
        </header>
        <div className="mx-auto w-full max-w-6xl min-w-0 flex-1 py-8" data-page-container style={{ paddingInline: "var(--page-gutter)" }}>{children}</div>
      </div>
    </PlayPageShell>
  );
}
