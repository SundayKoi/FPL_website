// One match's history: the teams lane by lane, each game's result and draft
// status, and the pick and ban of every drafted game.

import Link from "next/link";
import MatchDraftSummary from "@/components/matches/MatchDraftSummary";
import { draftHref, draftSummaryGames, type OffseasonDraftRow } from "@/lib/offseason/drafts";
import type { OffseasonMatch } from "@/lib/offseason/types";
import type { OffseasonView } from "@/lib/offseason/view";
import { ScheduleMatch } from "./Schedule";
import { Empty, Panel } from "./ui";

const DRAFT_STATUS = { complete: "Drafted", drafting: "Drafting" } as const;

export default function MatchHistory({ view, match, rows }: { view: OffseasonView; match: OffseasonMatch; rows: OffseasonDraftRow[] }) {
  const drafts = draftSummaryGames(view, match, rows);
  const results = view.gamesByMatch.get(match.id) ?? [];
  const teamName = (teamId: string | null | undefined) => (teamId ? view.teamsById.get(teamId)?.name : undefined) ?? "TBD";
  const draftOf = (number: number) => rows.find((row) => row.game_number === number && row.actions.length > 0);
  // Every game the match could still play; once it's decided, the games it did.
  const gameNumbers = Array.from({ length: match.best_of }, (_, index) => index + 1).filter(
    (number) => !match.winner_team_id || results.some((game) => game.game_number === number) || draftOf(number),
  );

  return (
    <>
      <Panel title="Result">
        <ul>
          <ScheduleMatch view={view} match={match} links={false} />
        </ul>
        <ul className="flex flex-col divide-y divide-border-subtle text-sm">
          {gameNumbers.map((number) => {
            const result = results.find((game) => game.game_number === number);
            const draft = draftOf(number);
            return (
              <li key={number} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <span className="w-16 font-semibold text-white">Game {number}</span>
                <span className={result?.winner_team_id ? "text-content" : "text-muted"}>
                  {result?.winner_team_id ? `${teamName(result.winner_team_id)} won` : result ? "Result pending" : "Not played yet"}
                </span>
                <span className="text-muted">{draft ? DRAFT_STATUS[draft.status] : "No draft yet"}</span>
                <Link href={draftHref(match.id, number)} className="ml-auto font-semibold text-action-text hover:underline">
                  {draft?.status === "complete" ? "Open draft" : "Draft room"}
                </Link>
              </li>
            );
          })}
        </ul>
      </Panel>

      {drafts.some((game) => game.actions.length > 0) ? (
        <MatchDraftSummary games={drafts} />
      ) : (
        <Panel title="Pick / ban">
          <Empty>
            The captains haven&apos;t drafted yet. Their picks and bans show here once they do, in the{" "}
            <Link href={draftHref(match.id)} className="text-action-text hover:underline">
              draft room
            </Link>
            .
          </Empty>
        </Panel>
      )}
    </>
  );
}
