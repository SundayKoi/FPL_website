import { LCS_DRAFT_STEPS } from "@/lib/match-draft/rules";
import type { DraftSide, MatchDraftChangeRequest, MatchDraftState } from "@/lib/match-draft/types";
import { TourneyCodeChip } from "@/components/match-draft/CopyButtons";
import { sideClass } from "@/components/match-draft/DraftMatchupBoard";
import { sameTeam, teamOnSide } from "@/components/match-draft/draftBoardHelpers";

const stepLabel = (stepIndex: number) => {
  const step = LCS_DRAFT_STEPS[stepIndex];
  return step ? `${step.side} ${step.kind} ${step.slot}` : `step ${stepIndex + 1}`;
};

export function DraftCompleteBanner({
  tourneyCode,
  hasGameTabs,
  canAdjustRoles,
  saving,
  onAdjustRoles,
}: {
  /** This game's tourney code — only ever present for captains/admins. */
  tourneyCode: string | null;
  hasGameTabs: boolean;
  canAdjustRoles: boolean;
  saving: boolean;
  onAdjustRoles: () => void;
}) {
  return (
    <section className="card-brand flex flex-wrap items-center gap-3 border-mint/40 p-3" aria-label="Draft complete">
      <span className="rounded-full border border-mint/50 bg-mint/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-mint">
        Draft complete
      </span>
      <span className="text-sm text-muted">
        All picks and bans are locked in.
        {tourneyCode
          ? " Create the custom lobby with this game's tourney code:"
          : hasGameTabs
            ? " Use the game tabs to move to the next game."
            : ""}
      </span>
      {tourneyCode ? <TourneyCodeChip code={tourneyCode} /> : null}
      {canAdjustRoles ? (
        <button
          type="button"
          disabled={saving}
          onClick={onAdjustRoles}
          className="ml-auto rounded-full border border-border-strong px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted transition hover:border-action-text hover:text-action-text disabled:opacity-40"
        >
          Adjust roles
        </button>
      ) : null}
    </section>
  );
}

/** Either captain (or an admin, on fixture drafts) records who won the
 *  finished game; the tally calls the series at the majority. */
export function GameResultPanel({
  state,
  canRecord,
  saving,
  winsA,
  winsB,
  bestOf,
  reportHref,
  onSetWinner,
}: {
  state: MatchDraftState;
  /** The viewer captains a side or is an admin. */
  canRecord: boolean;
  saving: boolean;
  winsA: number;
  winsB: number;
  bestOf: number;
  /** Set only once the series is decided on a fixture draft. */
  reportHref: string | null;
  onSetWinner: (teamName: string) => void;
}) {
  return (
    <section className="card-brand flex flex-wrap items-center gap-3 p-3" aria-label="Game result">
      <span className="label-dash">Game {state.gameNumber} result</span>
      {state.scheduledTeams.map((team) => {
        const won = sameTeam(state.winnerTeam, team.name);
        return (
          <button
            key={team.name}
            type="button"
            disabled={saving || !canRecord}
            aria-pressed={won}
            onClick={() => onSetWinner(team.name)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition disabled:opacity-40 ${
              won ? "border border-mint/60 bg-mint/15 text-mint" : "border border-border-subtle bg-surface text-muted hover:text-white"
            }`}
          >
            {team.abbreviation} won{won ? " ✓" : ""}
          </button>
        );
      })}
      <span className="text-sm text-muted">
        {winsA + winsB > 0
          ? // Just the score, no series call — scrim blocks play every game
            // regardless, and all games stay open either way.
            `Series score: ${state.scheduledTeams[0].abbreviation} ${winsA}–${winsB} ${state.scheduledTeams[1].abbreviation}.${
              winsA + winsB < bestOf ? " Remaining games stay open." : ""
            }`
          : canRecord
            ? "Either captain can record it — recorded results prefill your match report."
            : "Waiting on a captain to record the result."}
      </span>
      {/* Once the series is called, the shortest path to the paperwork. */}
      {reportHref ? (
        <a
          href={reportHref}
          className="ml-auto inline-flex rounded-full border border-coral/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-coral transition hover:bg-coral hover:text-canvas"
        >
          Report this result →
        </a>
      ) : null}
    </section>
  );
}

export function ChangeRequestBanner({
  request,
  requester,
  preview,
  canReset,
  viewerSide,
  saving,
  onRespond,
}: {
  request: MatchDraftChangeRequest;
  /** Abbreviation of the team asking for the redo. */
  requester: string;
  preview: boolean;
  canReset: boolean;
  viewerSide: DraftSide | null;
  saving: boolean;
  onRespond: (approve: boolean) => void;
}) {
  return (
    <section className="card-brand flex flex-wrap items-center gap-3 border-gold/40 p-3" aria-label="Change request">
      <span className="rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gold">
        Change requested
      </span>
      <span className="text-sm text-muted">
        {requester} wants to redo{" "}
        <span className="font-semibold uppercase text-white">{stepLabel(request.stepIndex)}</span>
        {request.champion ? ` (${request.champion})` : " (skipped)"}.
      </span>
      {!preview && (canReset || (viewerSide && viewerSide !== request.side)) ? (
        <span className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => onRespond(true)}
            className="rounded-full border border-mint/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-mint transition hover:bg-mint/15 disabled:opacity-40"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onRespond(false)}
            className="rounded-full border border-red-400/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-400 transition hover:bg-red-500/15 disabled:opacity-40"
          >
            Deny
          </button>
        </span>
      ) : !preview && viewerSide === request.side ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => onRespond(false)}
          className="rounded-full border border-border-subtle px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted transition hover:text-white disabled:opacity-40"
        >
          Withdraw
        </button>
      ) : (
        <span className="text-xs uppercase tracking-wide text-muted">Waiting for the other team…</span>
      )}
    </section>
  );
}

export function ReadyCheckPanel({
  state,
  bothReady,
  saving,
  mayActFor,
  onToggleReady,
}: {
  state: MatchDraftState;
  bothReady: boolean;
  saving: boolean;
  mayActFor: (side: DraftSide) => boolean;
  onToggleReady: (side: DraftSide) => void;
}) {
  const notReadyTeams = (["blue", "red"] as DraftSide[])
    .filter((side) => !(side === "blue" ? state.blueReady : state.redReady))
    .map((side) => teamOnSide(state, side).abbreviation);
  return (
    <section className="card-brand flex flex-col items-center gap-4 border-gold/50 p-6 text-center" aria-label="Ready check">
      <span className="rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-gold">
        Ready check
      </span>
      <h2 className="type-display text-2xl text-white sm:text-3xl">
        {state.sideChoiceRequired
          ? "Choose sides first, then ready up"
          : bothReady
            ? "Both teams ready — the draft is live!"
            : "Both teams must ready up to start"}
      </h2>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {(["blue", "red"] as DraftSide[]).map((side) => {
          const isReady = side === "blue" ? state.blueReady : state.redReady;
          const canPress = !saving && !state.sideChoiceRequired && mayActFor(side);
          return (
            <button
              key={side}
              type="button"
              disabled={saving || state.sideChoiceRequired || !mayActFor(side)}
              aria-pressed={isReady}
              onClick={() => onToggleReady(side)}
              className={`rounded-full border-2 px-6 py-3 text-sm font-bold uppercase tracking-wide transition disabled:opacity-40 ${
                isReady
                  ? "border-mint/70 bg-mint/15 text-mint"
                  : `${sideClass[side]} ${canPress && !isReady ? "animate-pulse hover:brightness-125" : ""}`
              }`}
            >
              {teamOnSide(state, side).abbreviation} {isReady ? "ready ✓" : "ready?"}
            </button>
          );
        })}
      </div>
      <span className="text-xs uppercase tracking-wide text-muted">
        {state.sideChoiceRequired
          ? "Pick which team takes blue side above."
          : bothReady
            ? "The clock is running — blue's first ban is up."
            : `Waiting on ${notReadyTeams.join(" and ")} — picks unlock once both teams check in.`}
      </span>
    </section>
  );
}

export function SideChooser({
  state,
  saving,
  onChooseBlue,
}: {
  state: MatchDraftState;
  saving: boolean;
  onChooseBlue: (team: MatchDraftState["blueTeam"]) => void;
}) {
  return (
    <section className="card-brand flex flex-wrap items-center gap-3 p-3" aria-label="Side selection">
      <span className="label-dash">{state.sideChoiceRequired ? "Choose sides to start" : "Choose sides"}</span>
      {state.scheduledTeams.map((team) => (
        <button
          key={team.name}
          type="button"
          disabled={saving}
          onClick={() => onChooseBlue(team)}
          aria-pressed={state.blueTeam.name === team.name}
          className="btn-pill px-3 py-1.5 text-xs"
        >
          {team.name} blue side
        </button>
      ))}
    </section>
  );
}
