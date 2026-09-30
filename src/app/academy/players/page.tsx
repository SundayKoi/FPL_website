import type { Metadata } from "next";
import Link from "next/link";
import AcademyPlayersDirectory from "@/components/academy/AcademyPlayersDirectory";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { fetchAcademyPlayers, mergeAcademyPlayers } from "@/lib/academy/playerSheet";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchLeagueSeasons } from "@/lib/league/season";
import { draftRosterClaimEntries, loadRosterClaimTargets } from "@/lib/teams/rosterClaims";
import { fetchStaffTier } from "@/lib/auth/staffTier";

export const metadata: Metadata = {
  title: "Players — FPL Academy",
};

export default async function AcademyPlayersPage() {
  const supabase = await createServerSupabase();
  const [
    { data: userData },
    draftData,
    sheetPlayers,
    leagueSeasons,
    { data: activeLeagueTeams },
    staffTier,
  ] = await Promise.all([
    supabase.auth.getUser(),
    fetchAcademyDraftData(supabase),
    fetchAcademyPlayers(),
    fetchLeagueSeasons(supabase),
    supabase.from("league_teams").select("id, name").eq("active", true),
    fetchStaffTier(supabase),
  ]);

  const players = draftData.draft ? mergeAcademyPlayers(draftData.players, sheetPlayers) : [];
  const claimEntries = draftRosterClaimEntries(
    draftData.players,
    draftData.teams,
    (activeLeagueTeams as { id: string; name: string }[] | null) ?? [],
    () => "/academy/players",
  );
  const playerClaims = await loadRosterClaimTargets(
    supabase,
    claimEntries,
    "academy",
    leagueSeasons.academy,
    userData.user?.id ?? null,
  );

  return (
    <>
    {staffTier.isAdmin || staffTier.isOwner ? (
      <div className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6 lg:px-8">
        <Link href="/admin/league/players?league=academy" className="text-sm font-semibold text-action-text underline underline-offset-4">Manage the Academy player pool in Admin →</Link>
      </div>
    ) : null}
    <AcademyPlayersDirectory
      players={players}
      isAdmin={false}
      poolSeasonKey="academy-1"
      playerClaims={playerClaims}
    />
    </>
  );
}
