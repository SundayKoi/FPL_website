import { redirect } from "next/navigation";
import { loadMyTeamDashboard } from "@/lib/my-team/queries";
import type { LeagueKey } from "@/lib/players/identity";
import { createServerSupabase } from "@/lib/supabase/server";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function redirectLegacyCaptain({
  league,
  destination,
  searchParams,
}: {
  league: LeagueKey;
  destination: string;
  searchParams: SearchParams;
}) {
  const requestedTeamId = first((await searchParams).team);
  let suffix = "";

  if (requestedTeamId) {
    try {
      const supabase = await createServerSupabase();
      const dashboard = await loadMyTeamDashboard(supabase, league, requestedTeamId);
      if (dashboard.kind === "ready" && dashboard.isAdmin && dashboard.team.id === requestedTeamId) {
        suffix = `?team=${encodeURIComponent(requestedTeamId)}`;
      }
    } catch (error) {
      console.error("Unable to validate legacy Captain team override", error);
    }
  }

  redirect(`${destination}${suffix}`);
}
