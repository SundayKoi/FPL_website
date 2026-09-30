import type { CSSProperties, Dispatch, RefObject, SetStateAction } from "react";
import type { ChampionRole, MatchDraftChampion } from "@/lib/match-draft/champions";
import { isChampionUnavailable, normalizeChampionName } from "@/lib/match-draft/rules";
import type { MatchDraftAction, MatchDraftImageSize, MatchDraftLayout } from "@/lib/match-draft/types";
import { MATCH_DRAFT_IMAGE_SIZES } from "@/components/match-draft/matchDraftSizes";

const ROLE_FILTERS: { value: ChampionRole; label: string }[] = [
  { value: "top", label: "Top" },
  { value: "jungle", label: "Jungle" },
  { value: "mid", label: "Mid" },
  { value: "adc", label: "ADC" },
  { value: "support", label: "Support" },
];

/** The searchable champion grid plus the role filter and the two-click
 *  "Pass ban" control. Controlled: the board owns the search, filter and
 *  pass-confirmation state so they survive a layout switch. */
export function ChampionPool({
  layout,
  query,
  onQueryChange,
  roleFilter,
  onRoleFilterChange,
  canPassBan,
  confirmingPass,
  onStartPass,
  onCancelPass,
  onConfirmPass,
  saving,
  scrollRef,
  imageSize,
  champions,
  actions,
  blockedChampions,
  blockedGames,
  selectedChampion,
  pickDisabled,
  onChoose,
}: {
  layout: MatchDraftLayout;
  query: string;
  onQueryChange: (query: string) => void;
  roleFilter: ChampionRole | null;
  onRoleFilterChange: Dispatch<SetStateAction<ChampionRole | null>>;
  canPassBan: boolean;
  confirmingPass: boolean;
  onStartPass: () => void;
  onCancelPass: () => void;
  onConfirmPass: () => void;
  saving: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  imageSize: MatchDraftImageSize;
  /** Already filtered by the search and role filter. */
  champions: MatchDraftChampion[];
  actions: MatchDraftAction[];
  blockedChampions: string[];
  /** Which earlier game took each fearless-blocked champion (normalized name). */
  blockedGames: Record<string, number>;
  selectedChampion: string | undefined;
  /** True when no champion may be chosen right now, whatever its status. */
  pickDisabled: boolean;
  onChoose: (champion: string) => void;
}) {
  return (
    <section className={`flex h-full min-h-0 max-h-[60vh] min-w-0 flex-col rounded border border-border-subtle bg-canvas/60 p-3 ${layout === "board" ? "xl:max-h-none" : "xl:max-h-[60vh]"}`} aria-label="Champion pool">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-muted sm:max-w-xs">
          Search champions
          <input value={query} onChange={(e) => onQueryChange(e.target.value)} className="input-brand px-3 py-2 text-sm" />
        </label>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Role filter">
          <button
            type="button"
            aria-pressed={roleFilter === null}
            onClick={() => onRoleFilterChange(null)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
              roleFilter === null ? "bg-coral text-canvas" : "border border-border-subtle bg-surface text-muted hover:text-white"
            }`}
          >
            All
          </button>
          {ROLE_FILTERS.map((role) => (
            <button
              key={role.value}
              type="button"
              aria-pressed={roleFilter === role.value}
              onClick={() => onRoleFilterChange((current) => (current === role.value ? null : role.value))}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
                roleFilter === role.value ? "bg-coral text-canvas" : "border border-border-subtle bg-surface text-muted hover:text-white"
              }`}
            >
              {role.label}
            </button>
          ))}
        </div>
        {canPassBan ? (
          <div className="ml-auto flex items-center gap-2">
            {confirmingPass ? (
              <>
                <span className="text-[11px] uppercase tracking-wide text-muted">Ban nothing?</span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={onCancelPass}
                  className="rounded-full border border-border-subtle px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted transition hover:text-white disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={onConfirmPass}
                  className="rounded-full border border-red-400/60 bg-red-400/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-red-300 transition hover:bg-red-400/20 disabled:opacity-40"
                >
                  Confirm pass
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={onStartPass}
                className="rounded-full border border-border-subtle px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted transition hover:border-red-400/60 hover:text-red-300 disabled:opacity-40"
              >
                Pass ban
              </button>
            )}
          </div>
        ) : null}
      </div>
      <div
        ref={scrollRef}
        className="mt-3 min-h-0 flex-1 grid content-start gap-1 overflow-y-auto overscroll-contain pr-1 touch-pan-y [grid-template-columns:repeat(auto-fill,minmax(min(100%,var(--pool-min-width)),1fr))]"
        data-testid="champion-pool-grid"
        data-size={imageSize}
        style={{
          "--pool-min-width": MATCH_DRAFT_IMAGE_SIZES[imageSize].poolMinWidth,
          gridAutoRows: `minmax(${MATCH_DRAFT_IMAGE_SIZES[imageSize].poolMinWidth}, auto)`,
        } as CSSProperties}
      >
        {champions.map((champion) => {
          const unavailable = isChampionUnavailable(champion.name, actions, blockedChampions);
          const selected = selectedChampion === champion.name;
          // Taken by an EARLIER game (fearless) rather than merely used in this
          // one — the two states share `unavailable` but must never look alike.
          const takenInGame = blockedGames[normalizeChampionName(champion.name)];
          const fearlessBlocked = unavailable && takenInGame !== undefined;
          return (
            <button
              key={champion.id}
              type="button"
              disabled={unavailable || pickDisabled}
              aria-pressed={selected}
              onClick={() => onChoose(champion.name)}
              aria-label={`${champion.name}${unavailable ? " unavailable" : ""}${fearlessBlocked ? ` — picked in game ${takenInGame}` : ""}`}
              className={`group relative aspect-square overflow-hidden border text-left font-semibold text-white disabled:cursor-not-allowed ${
                selected
                  ? "border-gold bg-gold/20 ring-2 ring-inset ring-gold/70"
                  : fearlessBlocked
                  ? "border-red-500/40 bg-surface disabled:opacity-60"
                  : "border-border-strong bg-surface hover:border-action-text disabled:opacity-35"
              } ${MATCH_DRAFT_IMAGE_SIZES[imageSize].name}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={champion.iconUrl}
                alt=""
                className={`h-full w-full object-cover transition group-hover:scale-105 ${fearlessBlocked ? "grayscale" : ""}`}
                loading="lazy"
              />
              {fearlessBlocked ? (
                <>
                  {/* The strike itself: two hairlines corner to corner, drawn
                      over the art so it reads at every grid size. */}
                  <svg
                    data-testid="fearless-cross"
                    aria-hidden
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="pointer-events-none absolute inset-0 h-full w-full"
                  >
                    <line x1="4" y1="4" x2="96" y2="96" stroke="rgb(248 113 113 / 0.85)" strokeWidth="6" />
                    <line x1="96" y1="4" x2="4" y2="96" stroke="rgb(248 113 113 / 0.85)" strokeWidth="6" />
                  </svg>
                  <span className="absolute right-0 top-0 bg-red-500/85 px-1 text-[10px] font-bold leading-tight text-white">
                    G{takenInGame}
                  </span>
                </>
              ) : null}
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/75 px-1.5 py-1 text-[11px] leading-tight">{champion.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
