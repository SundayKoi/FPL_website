import type { Metadata } from "next";
import Link from "next/link";
import ClaimQueueRow from "@/components/cards/ClaimQueueRow";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { cardSlug } from "@/lib/cards/build";
import { fetchAllCardSeasons, type CardLeague } from "@/lib/cards/queries";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Claim approvals — FPL",
  description: "Pending card claims waiting on a captain or admin.",
};

const LEAGUE_LABELS: Record<CardLeague, string> = { premier: "Premier", academy: "Academy" };

interface QueueClaim {
  summonerName: string;
  tag: string;
  slug: string;
  profileId: string;
  claimantName: string;
  createdLabel: string;
}

interface QueueSection {
  league: CardLeague;
  season: string;
  actionable: QueueClaim[];
  /** Pending claims belonging to someone else's roster — a count, not rows. */
  otherCount: number;
}

/** Fixed locale + UTC so the server render and the hydrated client agree,
 *  the same way the packs week label and the awards strip do it. */
function formatCreated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Every pending claim in one season, split into the ones this viewer may
 *  rule on and a tally of the ones that belong to another team's captain.
 *  Failure-tolerant throughout (the claims migration may not be applied):
 *  a season that can't be read simply contributes nothing. */
async function loadSeason(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  league: CardLeague,
  season: string,
  isAdmin: boolean,
): Promise<QueueSection> {
  const empty: QueueSection = { league, season, actionable: [], otherCount: 0 };

  const { data } = await supabase
    .from("card_claims")
    .select("summoner_name, tag, profile_id, created_at")
    .eq("season", season)
    .eq("status", "pending")
    .order("created_at")
    .then((result) => result, () => ({ data: null }));
  const rows = (data as { summoner_name: string; tag: string; profile_id: string; created_at: string }[] | null) ?? [];
  if (rows.length === 0) return empty;

  // profiles carries a public read policy, so one batched lookup names every
  // claimant on the page.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", [...new Set(rows.map((row) => row.profile_id))])
    .then((result) => result, () => ({ data: null }));
  const names = new Map<string, string>();
  for (const profile of (profiles as { id: string; display_name: string | null }[] | null) ?? []) {
    if (profile.display_name) names.set(profile.id, profile.display_name);
  }

  const section: QueueSection = { league, season, actionable: [], otherCount: 0 };
  for (const row of rows) {
    // Admins moderate every card, so skip the round-trip entirely; everyone
    // else gets the same predicate the UPDATE/DELETE policies will apply.
    let canAct = isAdmin;
    if (!canAct) {
      const { data: moderates } = await supabase
        .rpc("can_moderate_card", { p_season: season, p_summoner: row.summoner_name, p_tag: row.tag })
        .then((result) => result, () => ({ data: null }));
      canAct = moderates === true;
    }
    if (!canAct) {
      section.otherCount += 1;
      continue;
    }
    section.actionable.push({
      summonerName: row.summoner_name,
      tag: row.tag,
      slug: cardSlug(row.summoner_name, row.tag),
      profileId: row.profile_id,
      claimantName: names.get(row.profile_id) ?? "a player",
      createdLabel: formatCreated(row.created_at),
    });
  }
  return section;
}

/** One inbox for every pending card claim the viewer can rule on, across
 *  both leagues. The per-card share page can already approve a claim, but
 *  that means hunting down one URL per claim — this is the same two writes
 *  (RLS is still the real gate) with the hunting removed. Not premium-gated
 *  like the card hub: the people who can act here are captains and admins,
 *  and the page shows nothing to anyone else. */
export default async function ClaimApprovalsPage() {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth
    .getUser()
    .then((result) => result, () => ({ data: { user: null } }));
  const viewerProfileId = userData.user?.id ?? null;

  if (!viewerProfileId) {
    return (
      <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Card claims</span>
        <h1 className="type-display text-3xl sm:text-4xl">Sign in to review card claims</h1>
        <p className="max-w-md text-sm text-steel">
          Approving a claim is a captain and admin job — sign in with Discord to see the ones waiting on you.
        </p>
        <Link href="/login?redirect=/cards/claims" className="btn-pill mt-2">
          Sign in with Discord
        </Link>
      </main>
    );
  }

  const staffTier = await fetchStaffTier(supabase);
  const seasons = await fetchAllCardSeasons(supabase);
  const sections: QueueSection[] = [];
  for (const { league, season } of seasons) {
    sections.push(await loadSeason(supabase, league, season, staffTier.isAdmin));
  }
  const totalPending = sections.reduce((sum, section) => sum + section.actionable.length + section.otherCount, 0);

  return (
    <main className="bg-hash mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header>
        <span className="label-dash">Card claims</span>
        <h1 className="type-display mt-2 text-4xl sm:text-5xl">Claim approvals</h1>
        <p className="mt-3 text-sm text-steel">
          Approving links a Discord account to a card so the player can customize it — the skin, the motto,
          the signature. Approve only people claiming their own card.
        </p>
        <Link href="/cards" className="mt-3 inline-block text-xs text-steel underline-offset-4 hover:text-coral hover:underline">
          ← Back to player cards
        </Link>
      </header>

      {totalPending === 0 ? (
        <p className="text-sm text-steel">No pending claims — all caught up.</p>
      ) : (
        sections
          .filter((section) => section.actionable.length > 0 || section.otherCount > 0)
          .map((section) => (
            <section key={`${section.league}-${section.season}`} className="flex flex-col gap-3">
              <h2 className="label-dash">
                {LEAGUE_LABELS[section.league]} · {section.season}
              </h2>
              {section.actionable.map((claim) => (
                <ClaimQueueRow
                  key={`${claim.summonerName}-${claim.tag}`}
                  season={section.season}
                  summonerName={claim.summonerName}
                  tag={claim.tag}
                  slug={claim.slug}
                  claimantName={claim.claimantName}
                  createdLabel={claim.createdLabel}
                  viewerProfileId={viewerProfileId}
                />
              ))}
              {section.otherCount > 0 ? (
                <p className="text-xs text-steel">
                  {section.otherCount} more pending {section.otherCount === 1 ? "claim needs" : "claims need"} their
                  team&apos;s captain.
                </p>
              ) : null}
            </section>
          ))
      )}
    </main>
  );
}
