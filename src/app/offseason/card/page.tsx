import type { Metadata } from "next";
import Link from "next/link";
import { ClaimAndSign, SignOwnCard } from "@/components/offseason/SignCard";
import { Empty, OffseasonShell, Panel } from "@/components/offseason/ui";
import { unclaimedSpots } from "@/lib/offseason/lockIn";
import { loadOffseasonPage } from "@/lib/offseason/page";
import { fetchSignatures } from "@/lib/offseason/queries";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Your Offseason Card — FPL",
  description: "Claim your offseason card and sign it.",
};

export default async function OffseasonCardPage() {
  const { view, userId, isStaff, ownEntry } = await loadOffseasonPage();
  const signatures = ownEntry ? await fetchSignatures(await createServerSupabase(), [ownEntry.id]) : new Map<string, string>();
  const playing = ownEntry && ownEntry.status !== "withdrawn" ? ownEntry : null;
  const spots = view && userId && !ownEntry && view.event.status !== "complete" ? unclaimedSpots(view.entrants) : [];

  return (
    <OffseasonShell
      eyebrow={view?.event.name ?? "FPL Offseason"}
      title="Your card"
      active="card"
      isStaff={isStaff}
      description="Every player in the tournament has a card. Claim yours and sign it: your signature goes on your card here and on the signed copies people pull from offseason packs."
    >
      <Panel title={playing ? playing.display_name : "Claim your card"}>
        {!view ? (
          <Empty>The offseason tournament has not been set up yet.</Empty>
        ) : !userId ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">Sign in with Discord to claim and sign your card.</p>
            <Link href="/login?redirect=/offseason/card" className="btn-pill self-start text-sm">
              Sign in
            </Link>
          </div>
        ) : view.event.status === "complete" ? (
          <Empty>The event is over, so cards can&apos;t be signed any more.</Empty>
        ) : playing ? (
          <SignOwnCard eventId={view.event.id} card={view.ratings.get(playing.id)?.card ?? null} signature={signatures.get(playing.id) ?? null} />
        ) : ownEntry ? (
          <Empty>You withdrew from the event, so there&apos;s no card to sign.</Empty>
        ) : spots.length > 0 ? (
          <ClaimAndSign eventId={view.event.id} spots={spots} />
        ) : (
          <Empty>Only players in the tournament have a card, and every card has been claimed.</Empty>
        )}
      </Panel>
    </OffseasonShell>
  );
}
