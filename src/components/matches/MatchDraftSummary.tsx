import { championIconUrl } from "@/lib/match-draft/champions";
import { actionForStep, LCS_DRAFT_STEPS, normalizeChampionName, pickOrderBySide } from "@/lib/match-draft/rules";
import type { DraftSide, MatchDraftAction, MatchDraftPositions } from "@/lib/match-draft/types";

const ROLE_LABELS = ["Top", "Jungle", "Mid", "ADC", "Support"] as const;

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
  const steps = LCS_DRAFT_STEPS.filter((step) => step.side === side);
  const forKind = (kind: "pick" | "ban") =>
    steps.filter((step) => step.kind === kind).map((step) => actionForStep(game.actions, step)?.champion ?? null);
  const confirmedOrder = game.positions?.[side] ?? null;
  // Confirmed role order (top→support) when the captains set it, draft
  // order otherwise.
  const picks = confirmedOrder ?? forKind("pick");
  // Once roles are confirmed the row is no longer in draft order, so the
  // pick number has to travel WITH each champion — reading it off the
  // index would then be wrong for every reordered game.
  const order = pickOrderBySide(game.actions, side);
  return {
    bans: forKind("ban"),
    picks,
    pickNumbers: picks.map((champion) => (champion ? order.get(normalizeChampionName(champion))?.pick ?? null : null)),
    confirmed: confirmedOrder !== null,
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
        <div key={game.gameNumber} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-steel">Game {game.gameNumber}</span>
            {game.winnerTeam && (
              <span className="rounded-full border border-gold/50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-gold">
                {game.winnerTeam} win
              </span>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {(["blue", "red"] as DraftSide[]).map((side) => {
              const { bans, picks, pickNumbers, confirmed } = sideRows(game, side);
              const teamName = side === "blue" ? game.blueTeamName : game.redTeamName;
              return (
                <div key={side} className="rounded border border-line/60 bg-navy/40 p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        side === "blue" ? "bg-sky-500/20 text-sky-300" : "bg-red-500/20 text-red-300"
                      }`}
                    >
                      {side}
                    </span>
                    <span className="truncate text-steel">{teamName ?? "TBD"}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    {bans.map((champion, index) => (
                      <ChampionIcon key={`ban-${index}`} name={champion} banned size="h-7 w-7" />
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap items-start gap-1.5">
                    {picks.map((champion, index) => (
                      <span key={`pick-${index}`} className="relative flex flex-col items-center gap-0.5">
                        <ChampionIcon name={champion} />
                        {/* The pick number, always. Before roles are
                            confirmed the row IS draft order and the badge
                            just restates it; after, the row is top-to-support
                            and this is the only thing left saying when the
                            champion was taken. */}
                        {pickNumbers[index] ? (
                          <span
                            aria-hidden
                            className="absolute -left-1 -top-1 rounded-full border border-line/70 bg-navy px-1 text-[8px] font-bold leading-4 text-steel"
                          >
                            {pickNumbers[index]}
                          </span>
                        ) : null}
                        {confirmed && (
                          <span className="text-[9px] uppercase tracking-wide text-steel">
                            {ROLE_LABELS[index]}
                            <span className="sr-only">
                              {pickNumbers[index] ? `, pick ${pickNumbers[index]}` : ""}
                            </span>
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
