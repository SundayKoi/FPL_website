import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MatchHistory from "@/components/offseason/MatchHistory";
import { OffseasonShell } from "@/components/offseason/ui";
import { fetchMatchDrafts, matchLabel } from "@/lib/offseason/drafts";
import { loadOffseasonPage } from "@/lib/offseason/page";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Offseason Match — FPL",
  description: "An offseason tournament match: its result and each game's pick and ban.",
};

/** One match's history: the teams lane by lane, each game's result, and its draft. */
export default async function OffseasonMatchPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const { view, isStaff } = await loadOffseasonPage();
  const match = view?.matches.find((candidate) => candidate.id === matchId);
  if (!view || !match) notFound();
  const rows = await fetchMatchDrafts(await createServerSupabase(), [match.id]);
  const teamName = (teamId: string) => view.teamsById.get(teamId)?.name ?? "TBD";

  return (
    <OffseasonShell
      eyebrow={view.event.name}
      title={`${teamName(match.team_a_id)} vs ${teamName(match.team_b_id)}`}
      description={matchLabel(view, match)}
      active="schedule"
      isStaff={isStaff}
    >
      <MatchHistory view={view} match={match} rows={rows} />
      <Link href="/offseason/schedule" className="text-sm font-semibold text-action-text hover:underline">
        ← Back to the schedule
      </Link>
    </OffseasonShell>
  );
}
