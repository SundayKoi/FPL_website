import { redirect } from "next/navigation";
import AdminSectionContext from "@/components/admin/AdminSectionContext";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AcademyPlayersDirectory from "@/components/academy/AcademyPlayersDirectory";
import PlayersDirectory from "@/components/players/PlayersDirectory";
import type { PlayerPoolRow } from "@/components/players/PlayerPoolAdmin";
import type { PlayerIdentityLinkRow, VerifiedProfileOption } from "@/components/players/PlayerIdentityAdmin";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { fetchAcademyPlayers, mergeAcademyPlayers } from "@/lib/academy/playerSheet";
import { adaptCanonicalPlayerPool } from "@/lib/players/freeAgency";
import { FREE_AGENCY_PLAYER_SUMMARIES } from "@/lib/players/freeAgencyData";
import { primaryLinkedAccountUrl } from "@/lib/players/linkedAccounts";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchLeagueSeasons } from "@/lib/league/season";
import { resolveLeagueView } from "@/lib/league/context";

export const metadata = { title: "Players — FPL Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminPlayersPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin && !isOwner) redirect("/admin");

  const params = await searchParams;
  const league = resolveLeagueView(params.league);
  const leagueSeasons = await fetchLeagueSeasons(supabase);
  const identitySeason = leagueSeasons[league];

  if (league === "academy") {
    const [draftData, sheetPlayers, canonicalResult, profilesResult, identityResult] = await Promise.all([
      fetchAcademyDraftData(supabase),
      fetchAcademyPlayers(),
      supabase.from("player_pool").select("id, season_key, display_name, role, rank, opgg_url").eq("season_key", "academy-1"),
      isAdmin && identitySeason ? supabase.from("profiles").select("id, display_name, discord_id") : Promise.resolve({ data: [] }),
      isAdmin && identitySeason
        ? supabase.from("player_identity_links").select("id, player_pool_id, profile_id, status").eq("league", "academy").eq("season", identitySeason)
        : Promise.resolve({ data: [] }),
    ]);
    const canonicalPlayers: PlayerPoolRow[] = ((canonicalResult.data as PlayerPoolRow[] | null) ?? []).map((player) => ({ ...player }));
    const identityProfiles: VerifiedProfileOption[] = ((profilesResult.data as { id: string; display_name: string; discord_id: string | null }[] | null) ?? [])
      .map((profile) => ({ id: profile.id, displayName: profile.display_name, discordId: profile.discord_id }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
    const identityLinks: PlayerIdentityLinkRow[] = ((identityResult.data as { id: string; player_pool_id: string; profile_id: string | null; status: string }[] | null) ?? [])
      .filter((link): link is typeof link & { profile_id: string; status: "pending" | "approved" } =>
        Boolean(link.profile_id) && (link.status === "pending" || link.status === "approved"))
      .map((link) => ({ id: link.id, playerPoolId: link.player_pool_id, profileId: link.profile_id, status: link.status }));

    return (
      <main className="page-backdrop mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 text-content sm:px-6 lg:px-8">
        <AdminSectionHeader title="Players" description="Edit the canonical Academy player pool and roster identity links. The Academy pool is a fixed edition; its current season does not change the player-pool target.">
          <AdminSectionContext league="academy" defaultSeasons={{ premier: leagueSeasons.premier || "S5", academy: leagueSeasons.academy || "A1" }} leagueOnly />
        </AdminSectionHeader>
        {canonicalResult.error ? <p role="alert" className="card-brand p-4 text-sm text-red-300">Academy player data is unavailable.</p> : null}
        <AcademyPlayersDirectory
          players={draftData.draft ? mergeAcademyPlayers(draftData.players, sheetPlayers) : []}
          canonicalPlayers={canonicalPlayers}
          isAdmin={isAdmin}
          poolSeasonKey="academy-1"
          identitySeason={identitySeason || undefined}
          identityLinks={identityLinks}
          identityProfiles={identityProfiles}
        />
      </main>
    );
  }

  const [{ data: bids }, { data: canonicalPlayers, error: canonicalPlayersError }, profilesResult, identityResult] = await Promise.all([
    supabase.from("free_agency_avg_bids").select("player_name, avg_bid"),
    supabase.from("player_pool").select("id, season_key, display_name, role, rank, opgg_url").eq("season_key", "season-5"),
    isAdmin && identitySeason ? supabase.from("profiles").select("id, display_name, discord_id") : Promise.resolve({ data: [] }),
    isAdmin && identitySeason
      ? supabase.from("player_identity_links").select("id, player_pool_id, profile_id, status").eq("league", "premier").eq("season", identitySeason)
      : Promise.resolve({ data: [] }),
  ]);
  const identityProfiles: VerifiedProfileOption[] = ((profilesResult.data as { id: string; display_name: string; discord_id: string | null }[] | null) ?? [])
    .map((profile) => ({ id: profile.id, displayName: profile.display_name, discordId: profile.discord_id }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const identityLinks: PlayerIdentityLinkRow[] = ((identityResult.data as { id: string; player_pool_id: string; profile_id: string | null; status: string }[] | null) ?? [])
    .filter((link): link is typeof link & { profile_id: string; status: "pending" | "approved" } =>
      Boolean(link.profile_id) && (link.status === "pending" || link.status === "approved"))
    .map((link) => ({ id: link.id, playerPoolId: link.player_pool_id, profileId: link.profile_id, status: link.status }));
  const linkedPlayers = ((canonicalPlayers as PlayerPoolRow[] | null) ?? []).map((player) => ({
    ...player,
    opgg_url: primaryLinkedAccountUrl(player.display_name) ?? (player.opgg_url?.trim() ? player.opgg_url : null),
  }));
  const seasons = adaptCanonicalPlayerPool(linkedPlayers);
  const initialAvgBids = Object.fromEntries(((bids as { player_name: string; avg_bid: number }[] | null) ?? []).map((bid) => [bid.player_name, bid.avg_bid]));
  const canonicalAdminRows = ((canonicalPlayers as PlayerPoolRow[] | null) ?? []).map((player) => ({ ...player }));

  return (
    <main className="page-backdrop mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 text-content sm:px-6 lg:px-8">
      <AdminSectionHeader title="Players" description="Edit the canonical Premier player pool, free-agency averages, and player identity links. The player pool is currently the fixed Season 5 edition.">
        <AdminSectionContext league="premier" defaultSeasons={{ premier: leagueSeasons.premier || "S5", academy: leagueSeasons.academy || "A1" }} leagueOnly />
      </AdminSectionHeader>
      {canonicalPlayersError ? <p role="alert" className="card-brand p-4 text-sm text-red-300">Premier player data is unavailable.</p> : null}
      <PlayersDirectory
        seasons={seasons}
        canonicalPlayers={canonicalAdminRows}
        isAdmin={isAdmin}
        isOwner={isOwner}
        initialAvgBids={initialAvgBids}
        freeAgencyPlayers={FREE_AGENCY_PLAYER_SUMMARIES}
        identityLeague="premier"
        identitySeason={identitySeason || undefined}
        identityLinks={identityLinks}
        identityProfiles={identityProfiles}
        emptyStateMessages={{
          "season-4": "Season 4 player data has not been added yet.",
          ...(canonicalPlayersError || seasons["season-5"].every((section) => section.players.length === 0)
            ? { "season-5": "Player List data is unavailable for Season 5 right now." }
            : {}),
        }}
      />
    </main>
  );
}
