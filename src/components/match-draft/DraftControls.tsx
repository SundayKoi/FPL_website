import type { Dispatch, SetStateAction } from "react";
import type { MatchDraftGameTab, MatchDraftSeriesFormat, MatchDraftState } from "@/lib/match-draft/types";
import { BEST_OF_OPTIONS } from "@/components/match-draft/matchDraftOptions";
import { MATCH_DRAFT_IMAGE_SIZES, MATCH_DRAFT_IMAGE_SIZE_ORDER } from "@/components/match-draft/matchDraftSizes";

const imageSizes = MATCH_DRAFT_IMAGE_SIZE_ORDER.map((value) => ({ value, ...MATCH_DRAFT_IMAGE_SIZES[value] }));

/** One tab per game in the series; switching is instant, client-side. */
export function SeriesGameTabs({
  games,
  activeGameNumber,
  statesByGame,
  onSelect,
}: {
  games: MatchDraftGameTab[];
  activeGameNumber: number;
  statesByGame: Record<number, MatchDraftState>;
  onSelect: (game: MatchDraftGameTab) => void;
}) {
  return (
    <nav aria-label="Series games" className="flex flex-wrap items-center gap-1.5">
      {games.map((game) => {
        const active = game.gameNumber === activeGameNumber;
        // Live status from the client store (falls back to the server prop).
        const liveGame = statesByGame[game.gameNumber];
        const status = liveGame ? (liveGame.actions.length === 0 ? null : liveGame.status) : game.status;
        return (
          <button
            key={game.gameNumber}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onSelect(game)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
              active ? "bg-coral text-canvas" : "border border-border-subtle bg-surface text-muted hover:text-white"
            }`}
          >
            Game {game.gameNumber}
            {status === "complete" ? <span aria-label="complete" className={active ? "text-canvas" : "text-mint"}>✓</span> : null}
            {status === "drafting" ? <span aria-label="in progress" className={active ? "text-canvas" : "text-gold"}>●</span> : null}
          </button>
        );
      })}
    </nav>
  );
}

/** Fixture drafts only: Bo1/Bo3/Bo5 and the fearless toggle. */
export function SeriesFormatControls({
  format,
  saving,
  onChange,
}: {
  format: MatchDraftSeriesFormat;
  saving: boolean;
  onChange: (change: Partial<MatchDraftSeriesFormat>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Series format">
      <span className="label-dash">Format</span>
      {BEST_OF_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          disabled={saving}
          aria-pressed={format.bestOf === option}
          onClick={() => (format.bestOf === option ? undefined : void onChange({ bestOf: option }))}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition disabled:opacity-40 ${
            format.bestOf === option ? "bg-coral text-canvas" : "border border-border-subtle bg-surface text-muted hover:text-white"
          }`}
        >
          Bo{option}
        </button>
      ))}
      <button
        type="button"
        disabled={saving}
        aria-pressed={format.fearless}
        onClick={() => void onChange({ fearless: !format.fearless })}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition disabled:opacity-40 ${
          format.fearless ? "bg-mint/15 text-mint border border-mint/50" : "border border-border-subtle bg-surface text-muted hover:text-white"
        }`}
      >
        Fearless {format.fearless ? "on" : "off"}
      </button>
    </div>
  );
}

/** Steps the champion art size through MATCH_DRAFT_IMAGE_SIZE_ORDER. */
export function ImageSizeStepper({
  index,
  onIndexChange,
}: {
  /** Position in MATCH_DRAFT_IMAGE_SIZE_ORDER. */
  index: number;
  onIndexChange: Dispatch<SetStateAction<number>>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="label-dash">Image size</span>
      <button
        type="button"
        aria-label="Decrease image size"
        disabled={index === 0}
        onClick={() => onIndexChange((current) => Math.max(0, current - 1))}
        className="btn-pill px-3 py-1.5 text-xs disabled:opacity-40"
      >
        -
      </button>
      <span className="min-w-8 text-center text-xs font-semibold text-white">{imageSizes[index].label}</span>
      <button
        type="button"
        aria-label="Increase image size"
        disabled={index === imageSizes.length - 1}
        onClick={() => onIndexChange((current) => Math.min(imageSizes.length - 1, current + 1))}
        className="btn-pill px-3 py-1.5 text-xs disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
