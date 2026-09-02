import { formatKickoff } from "@/lib/schedule/format";
import { createDraftMatchupView } from "@/lib/match-draft/presentation";
import { LCS_DRAFT_STEPS } from "@/lib/match-draft/rules";
import type { DraftSide, MatchDraftAction } from "@/lib/match-draft/types";
import type { FullDraftSide, PastDraft } from "@/lib/scouting/types";
import { DraftMatchupBoard } from "@/components/match-draft/DraftMatchupBoard";

function legacyView(draft: PastDraft) {
  const actions: MatchDraftAction[] = [];
  for (const side of ["blue", "red"] as DraftSide[]) {
    const value: FullDraftSide = draft[side];
    const picks = [...value.picks];
    const bans = [...value.banPhaseOne, ...value.banPhaseTwo];
    for (const step of LCS_DRAFT_STEPS.filter((candidate) => candidate.side === side)) {
      const slot = step.kind === "pick" ? picks[step.slot - 1] : bans[step.slot - 1];
      if (!slot) continue;
      actions.push({ stepIndex: step.index, side, kind: step.kind, slot: step.slot, champion: slot.champion, skipped: slot.skipped, playerName: slot.playerName });
    }
  }
  return createDraftMatchupView({
    gameNumber: draft.gameNumber,
    blueTeam: { name: draft.blue.teamName ?? draft.fixture.team_a },
    redTeam: { name: draft.red.teamName ?? draft.fixture.team_b },
    actions,
    winnerTeam: draft.winnerTeam,
    metadata: { railNote: `Scouted team: ${draft.side === "blue" ? "Blue side" : "Red side"}` },
  });
}

export default function ScoutPastDrafts({ drafts }: { drafts: PastDraft[] }) {
  const grouped = new Map<string, PastDraft[]>();
  for (const draft of drafts) grouped.set(draft.fixture.id, [...(grouped.get(draft.fixture.id) ?? []), draft]);
  const series = [...grouped.values()].sort((a, b) => (b[0].fixture.scheduled_at ?? "").localeCompare(a[0].fixture.scheduled_at ?? ""));
  return (
    <section aria-labelledby="past-drafts-heading" className="card-brand p-5">
      <h2 id="past-drafts-heading" className="type-display text-2xl">Past drafts</h2>
      {series.length ? (
        <div className="mt-4 space-y-4">
          {series.map((games) => (
            <section key={games[0].fixture.id} aria-label={`Series ${games[0].fixture.id}`}>
              <h3 className="label-dash">{formatKickoff(games[0].fixture.scheduled_at)} · {games[0].fixture.team_a ?? "—"} vs {games[0].fixture.team_b ?? "—"}</h3>
              <div className="mt-2 space-y-2">
                {[...games].sort((a, b) => a.gameNumber - b.gameNumber).map((draft) => (
                  <details key={`${draft.fixture.id}-${draft.gameNumber}`} className="group rounded border border-border/70 bg-canvas/40 p-3">
                    <summary className="cursor-pointer list-none font-semibold text-white">
                      Game {draft.gameNumber}
                      <span className="ml-2 text-xs text-cyan">Scouted team: {draft.side === "blue" ? "Blue side" : "Red side"}</span>
                      <span className="ml-2 text-xs text-muted">{draft.winnerTeam ? `Winner: ${draft.winnerTeam}` : "Unresolved"}</span>
                    </summary>
                    <div className="mt-4">
                      <DraftMatchupBoard view={draft.matchup ?? legacyView(draft)} imageSize="lg" />
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : <p className="mt-4 text-sm text-muted">No recorded drafts for this opponent yet</p>}
    </section>
  );
}
