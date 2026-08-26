import type { Metadata } from "next";
import Link from "next/link";
import IdentityClaimQueueRow from "@/components/players/IdentityClaimQueueRow";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Identity claims — FPL",
  description: "Roster identity requests waiting for a captain or admin.",
};

type PendingIdentityRow = {
  id: string;
  player_pool_id: string;
  profile_id: string;
  league_team_id: string;
  league: "premier" | "academy";
  season: string;
  source: "team" | "card" | "admin";
  requested_at: string;
};

function formatRequested(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function IdentityClaimsPage() {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) {
    return (
      <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Roster identities</span>
        <h1 className="type-display text-3xl sm:text-4xl">Sign in to review identity claims</h1>
        <p className="max-w-md text-sm text-steel">Captains see requests for their own team. Admins see every team.</p>
        <Link href="/login?redirect=/identity-claims" className="btn-pill mt-2">Sign in with Discord</Link>
      </main>
    );
  }

  const [staffTier, [captainsSettled, claimsSettled]] = await Promise.all([
    fetchStaffTier(supabase),
    Promise.allSettled([
      supabase
        .from("league_team_captains")
        .select("league_team_id, season")
        .eq("profile_id", userData.user.id),
      // RLS is the authority boundary. It also lets a claimant read their own
      // row, so the presentation filter below narrows non-admin reviewers to
      // teams and seasons they captain rather than drawing forbidden controls.
      supabase
        .from("player_identity_links")
        .select("id, player_pool_id, profile_id, league_team_id, league, season, source, requested_at")
        .eq("status", "pending")
        .order("requested_at"),
    ]),
  ]);
  const captainsResult = captainsSettled.status === "fulfilled" ? captainsSettled.value : null;
  const claimsResult = claimsSettled.status === "fulfilled" ? claimsSettled.value : null;
  let claimsUnavailable = Boolean(
    claimsResult?.error || !claimsResult?.data || (!staffTier.isAdmin && (captainsResult?.error || !captainsResult?.data)),
  );
  const captainAssignments = new Set(
    ((captainsResult?.data as { league_team_id: string; season: string }[] | null) ?? [])
      .map((row) => `${row.league_team_id}\u0000${row.season}`),
  );
  const rows = ((claimsResult?.data as PendingIdentityRow[] | null) ?? [])
    .filter((row) => row.league_team_id)
    .filter((row) => staffTier.isAdmin || captainAssignments.has(`${row.league_team_id}\u0000${row.season}`));

  const playerIds = [...new Set(rows.map((row) => row.player_pool_id))];
  const teamIds = [...new Set(rows.map((row) => row.league_team_id))];
  const profileIds = [...new Set(rows.map((row) => row.profile_id))];
  const lookupSettled = rows.length > 0
    ? await Promise.allSettled([
        supabase.from("player_pool").select("id, display_name").in("id", playerIds),
        supabase.from("league_teams").select("id, name").in("id", teamIds),
        supabase.from("profiles").select("id, display_name").in("id", profileIds),
      ])
    : null;
  const [playersResult, teamsResult, profilesResult] = lookupSettled
    ? lookupSettled.map((result) => result.status === "fulfilled" ? result.value : null)
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  claimsUnavailable ||= Boolean(
    playersResult?.error || !playersResult?.data
      || teamsResult?.error || !teamsResult?.data
      || profilesResult?.error || !profilesResult?.data,
  );

  const playerNames = new Map(((playersResult?.data as { id: string; display_name: string }[] | null) ?? [])
    .map((row) => [row.id, row.display_name]));
  const teamNames = new Map(((teamsResult?.data as { id: string; name: string }[] | null) ?? [])
    .map((row) => [row.id, row.name]));
  const profileNames = new Map(((profilesResult?.data as { id: string; display_name: string | null }[] | null) ?? [])
    .map((row) => [row.id, row.display_name ?? "a signed-in player"]));

  return (
    <main className="bg-hash mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header>
        <span className="label-dash">Roster identities</span>
        <h1 className="type-display mt-2 text-4xl sm:text-5xl">Identity claims</h1>
        <p className="mt-3 text-sm text-steel">
          Approve only a player claiming their own current roster spot. Database policies limit captains to their team.
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-steel">
          <Link href="/admin/claims" className="underline-offset-4 hover:text-coral hover:underline">Card-only claims →</Link>
          <Link href="/teams" className="underline-offset-4 hover:text-coral hover:underline">Premier teams →</Link>
          <Link href="/academy/teams" className="underline-offset-4 hover:text-coral hover:underline">Academy teams →</Link>
        </div>
      </header>

      {claimsUnavailable ? (
        <p className="text-sm text-steel">Identity claims are unavailable right now. Refresh to try again.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-steel">No pending roster identity claims — all caught up.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <IdentityClaimQueueRow
              key={row.id}
              linkId={row.id}
              teamName={teamNames.get(row.league_team_id) ?? "Unknown team"}
              playerName={playerNames.get(row.player_pool_id) ?? "Unknown player"}
              claimantName={profileNames.get(row.profile_id) ?? "a signed-in player"}
              source={row.source}
              requestedLabel={formatRequested(row.requested_at)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
