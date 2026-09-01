import { championIconUrl } from "@/lib/match-draft/champions";
import { createDraftMatchupView } from "@/lib/match-draft/presentation";
import type { DraftSide, MatchDraftAction, MatchDraftPositions } from "@/lib/match-draft/types";
import { DraftMatchupBoard } from "@/components/match-draft/DraftMatchupBoard";

/** One drafted game, straight off a `match_drafts` row. */
export interface DraftSummaryGame {
  gameNumber: number;
  blueTeamName: string | null;
  redTeamName: string | null;
  winnerTeam: string | null;
  actions: MatchDraftAction[];
  positions: MatchDraftPositions | null;
}

export function ChampionIcon({ name, banned = false, size = "h-9 w-9" }: { name: string | null; banned?: boolean; size?: string }) {
  const src = name ? championIconUrl(name) : null;
  if (!src) {
    return <span className={`${size} rounded border border-dashed border-line/60 bg-navy/40`} title={name ?? "Skipped"} />;
  }
  return (
    <span className={`relative inline-block ${size} overflow-hidden rounded border border-line/60`} title={name ?? undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={name ?? ""} className={`h-full w-full object-cover ${banned ? "opacity-60 grayscale" : ""}`} loading="lazy" />
      {banned && (
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-sm font-bold text-red-400">
          ✕
        </span>
      )}
    </span>
  );
}

export function sideRows(
  game: DraftSummaryGame,
  side: DraftSide,
): {
  bans: (string | null)[];
  picks: (string | null)[];
  /** Per-side pick number for each entry of `picks`, aligned by index.
   *  Null where a pick was skipped or the champion is unknown. */
  pickNumbers: (number | null)[];
  confirmed: boolean;
} {
  const view = createDraftMatchupView({
    gameNumber: game.gameNumber,
    blueTeam: { name: game.blueTeamName },
    redTeam: { name: game.redTeamName },
    actions: game.actions,
    positions: game.positions,
    winnerTeam: game.winnerTeam,
  });
  const sideView = view[side];
  return {
    bans: sideView.bans.map((ban) => ban.champion),
    picks: sideView.picks.map((pick) => pick.champion),
    pickNumbers: sideView.picks.map((pick) => (pick.champion ? pick.pickNumber : null)),
    confirmed: game.positions?.[side]?.length === 5,
  };
}

/**
 * The pick/ban phase for each game the site's match drafter recorded —
 * rendered on /match/[id] beneath the header. Draft data exists as soon as
 * the draft finishes, so this often shows before any stats are ingested.
 */
export default function MatchDraftSummary({ games }: { games: DraftSummaryGame[] }) {
  const drafted = games.filter((game) => game.actions.length > 0);
  if (drafted.length === 0) return null;
  return (
    <section id="draft" className="card-brand flex flex-col gap-4 p-4" aria-label="Pick and ban phase">
      <h2 className="label-dash">Pick / ban</h2>
      {drafted.map((game) => (
        <DraftMatchupBoard
          key={game.gameNumber}
          view={createDraftMatchupView({
            gameNumber: game.gameNumber,
            blueTeam: { name: game.blueTeamName },
            redTeam: { name: game.redTeamName },
            actions: game.actions,
            positions: game.positions,
            winnerTeam: game.winnerTeam,
          })}
          imageSize="lg"
        />
      ))}
    </section>
  );
}
