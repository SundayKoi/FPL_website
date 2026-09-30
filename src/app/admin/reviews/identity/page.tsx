import Link from "next/link";
import { redirect } from "next/navigation";
import AdminSectionContext from "@/components/admin/AdminSectionContext";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import IdentityClaimQueueRow from "@/components/players/IdentityClaimQueueRow";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { resolveAdminLeagueSeason } from "@/lib/admin/scope";
import { createServerSupabase } from "@/lib/supabase/server";
import { firstParam } from "@/lib/searchParams";

export const metadata = { title: "Roster identity reviews — FPL Admin" };

const PAGE_SIZE = 30;
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

function formatRequested(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default async function AdminIdentityReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin && !isOwner) redirect("/admin");

  const params = await searchParams;
  const context = await resolveAdminLeagueSeason(supabase, params);
  const pageParam = firstParam(params.page);
  const page = pageParam && /^\d+$/.test(pageParam) ? Math.max(1, Number(pageParam)) : 1;
  const recordParam = firstParam(params.record);
  const selectedId = recordParam && /^[0-9a-f-]{36}$/i.test(recordParam) ? recordParam : undefined;

  const [pageResult, countResult] = await Promise.all([
    supabase.from("player_identity_links")
      .select("id, player_pool_id, profile_id, league_team_id, league, season, source, requested_at")
      .eq("league", context.league).eq("season", context.season).eq("status", "pending")
      .order("requested_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("player_identity_links").select("id", { count: "exact", head: true })
      .eq("league", context.league).eq("season", context.season).eq("status", "pending"),
  ]);
  let rows = ((pageResult.data as PendingIdentityRow[] | null) ?? []).filter((row) => row.league_team_id);
  if (selectedId && !rows.some((row) => row.id === selectedId)) {
    const selectedResult = await supabase.from("player_identity_links")
      .select("id, player_pool_id, profile_id, league_team_id, league, season, source, requested_at")
      .eq("id", selectedId).eq("league", context.league).eq("season", context.season).eq("status", "pending").maybeSingle();
    const selected = selectedResult.data as PendingIdentityRow | null;
    if (selected?.league_team_id) rows = [selected, ...rows];
  }

  const playerIds = [...new Set(rows.map((row) => row.player_pool_id))];
  const teamIds = [...new Set(rows.map((row) => row.league_team_id))];
  const profileIds = [...new Set(rows.map((row) => row.profile_id))];
  const [playersResult, teamsResult, profilesResult] = rows.length
    ? await Promise.all([
        supabase.from("player_pool").select("id, display_name").in("id", playerIds),
        supabase.from("league_teams").select("id, name").in("id", teamIds),
        supabase.from("profiles").select("id, display_name").in("id", profileIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  const unavailable = Boolean(pageResult.error || countResult.error || countResult.count === null || playersResult.error || teamsResult.error || profilesResult.error);
  const players = new Map(((playersResult.data as { id: string; display_name: string }[] | null) ?? []).map((row) => [row.id, row.display_name]));
  const teams = new Map(((teamsResult.data as { id: string; name: string }[] | null) ?? []).map((row) => [row.id, row.name]));
  const profiles = new Map(((profilesResult.data as { id: string; display_name: string | null }[] | null) ?? []).map((row) => [row.id, row.display_name ?? "a signed-in player"]));
  const count = countResult.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const queryContext = `league=${context.league}&season=${encodeURIComponent(context.season)}`;

  return (
    <main className="page-backdrop mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 text-content sm:px-6 lg:px-8">
      <AdminSectionHeader title="Roster identity requests" description="Approve only a player claiming their own current roster spot. Existing database policies and the decision trigger enforce the final permission and transition.">
        <AdminSectionContext league={context.league} season={context.season} seasonOptions={context.seasonOptions} defaultSeasons={context.defaultSeasons} />
      </AdminSectionHeader>
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <Link href={`/admin/claims?${queryContext}`} className="underline-offset-4 hover:text-action-text hover:underline">Card ownership queue →</Link>
        <Link href={context.league === "academy" ? "/academy/teams" : "/teams"} className="underline-offset-4 hover:text-action-text hover:underline">Public roster view →</Link>
      </div>
      {unavailable ? (
        <p role="alert" className="card-brand p-4 text-sm text-red-300">Roster identity data or its total count is unavailable. Refresh to try again.</p>
      ) : count === 0 ? (
        <p className="card-brand p-4 text-sm text-muted">No pending roster identity requests for {context.league} {context.season}.</p>
      ) : (
        <>
          <p className="text-xs text-muted">{count.toLocaleString("en-US")} pending · page {page} of {pageCount}</p>
          <div className="flex flex-col gap-3">
            {rows.map((row) => (
              <IdentityClaimQueueRow
                key={row.id}
                linkId={row.id}
                teamName={teams.get(row.league_team_id) ?? "Unknown team"}
                playerName={players.get(row.player_pool_id) ?? "Unknown player"}
                claimantName={profiles.get(row.profile_id) ?? "a signed-in player"}
                source={row.source}
                requestedLabel={formatRequested(row.requested_at)}
              />
            ))}
          </div>
          <div className="flex justify-between text-sm">
            {page > 1 ? <Link href={`/admin/reviews/identity?${queryContext}&page=${page - 1}`} className="text-action-text underline underline-offset-4">← Newer</Link> : <span />}
            {page < pageCount ? <Link href={`/admin/reviews/identity?${queryContext}&page=${page + 1}`} className="text-action-text underline underline-offset-4">Older →</Link> : null}
          </div>
        </>
      )}
    </main>
  );
}
