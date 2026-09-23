"use client";

// Step 1 — pick three cards. Every chip says who the card is, what it is
// worth ("power 7"), the edge its title carries, and — when it cannot be
// picked — why, in words on the chip rather than in a hover nobody on a
// phone can see. Three picked folds the grid into a one-line summary with
// "Change", so the next step is right there.

import { ABILITY_KIND_LABELS, abilityOf, abilitySheet } from "@/lib/expeditions/archetypes";
import { gradeOf, wearOf } from "@/lib/cards/wear";
import { mutationByKey } from "@/lib/cards/mutations";
import { tierLabel } from "@/lib/cards/tier";
import { SQUAD_SIZE, SURGE_BONUS, isProtected, shineOf, squadShine, woundedUntil, type CardCopy } from "@/lib/expeditions/config";
import { cardTeamKey } from "@/lib/expeditions/matchday";
import { milesOf, trailLine, trailTitleOf } from "@/lib/expeditions/trail";
import type { LostHold } from "@/lib/expeditions/queries";
import EmptyShelf from "../EmptyShelf";
import ExpeditionIcon, { type ExpeditionIconName } from "../expeditionIcons";
import { easternClock } from "./clock";
import StepHeading from "./StepHeading";
import Term from "./Term";

/** "Guard, Rival, Camp — all three count" — what the squad's edges come to. */
export function edgeSummary(squad: CardCopy[]): string | null {
  if (squad.length === 0) return null;
  const sheet = abilitySheet(squad);
  const kinds = sheet.map((entry) => ABILITY_KIND_LABELS[entry.ability.kind]);
  const ignored = sheet.filter((entry) => !entry.counts);
  const list = kinds.join(", ");
  if (squad.length < SQUAD_SIZE) return list;
  if (ignored.length === 0) return `${list} — all three count`;
  const kind = ABILITY_KIND_LABELS[ignored[0].ability.kind];
  return ignored.length === 1 ? `${list} — a second ${kind} counts for nothing` : `${list} — only one ${kind} counts`;
}

interface ChipStatus {
  icon: ExpeditionIconName;
  /** On the chip, in words. */
  reason: string;
  /** The old hover line, kept for the title attribute. */
  title: string;
  tone: string;
}

function statusOf(
  copy: CardCopy,
  { lost, deployed, awayUntil, now, full, selected }: { lost: boolean; deployed: boolean; awayUntil: string | null; now: Date; full: boolean; selected: boolean },
): ChipStatus | null {
  if (lost) return { icon: "lost", reason: "lost on the road", title: "Lost.", tone: "text-coral" };
  if (deployed) {
    return {
      icon: "away",
      reason: awayUntil ? `away until ${easternClock(awayUntil)}` : "away on a run",
      title: "On expedition.",
      tone: "text-gold",
    };
  }
  if (copy.card?.slab) return { icon: "sealed", reason: "sealed in a slab", title: "Slabbed — sealed, never fielded again.", tone: "text-steel" };
  const bench = woundedUntil(copy, now);
  if (bench) {
    const until = `wounded until ${easternClock(bench)}`;
    return { icon: "wounded", reason: until, title: `${until[0].toUpperCase()}${until.slice(1)} ET.`, tone: "text-gold" };
  }
  if (!selected && full) return { icon: "check", reason: "three picked", title: "Three are picked — drop one to swap.", tone: "text-steel" };
  return null;
}

export default function SquadStep({
  copies,
  picked,
  holds,
  deployedIds,
  awayUntil,
  now,
  playingKeys,
  base,
  collapsed,
  canSuggest,
  nextBack,
  onToggle,
  onClear,
  onSuggest,
  onChange,
}: {
  /** The shelf, strongest first. */
  copies: CardCopy[];
  picked: ReadonlySet<number>;
  holds: LostHold[];
  deployedIds: ReadonlySet<number>;
  /** When each card on a run in this season comes home. */
  awayUntil: ReadonlyMap<number, string>;
  now: Date;
  /** Badge keys of the teams playing today. */
  playingKeys: ReadonlySet<string>;
  base: string;
  /** Three picked and the grid folded away. */
  collapsed: boolean;
  canSuggest: boolean;
  /** When the next card comes home, if none is free now. */
  nextBack: Date | null;
  onToggle: (id: number) => void;
  onClear: () => void;
  onSuggest: () => void;
  onChange: () => void;
}) {
  const squad = copies.filter((copy) => picked.has(copy.id));
  const power = squadShine(squad);
  const full = picked.size >= SQUAD_SIZE;
  const edges = edgeSummary(squad);
  const lostIds = new Set(holds.map((hold) => hold.cardId));
  const isFree = (copy: CardCopy) => !lostIds.has(copy.id) && !deployedIds.has(copy.id) && !copy.card?.slab && woundedUntil(copy, now) === null;
  const anyFree = copies.some(isFree);
  // The cards that can go first, strongest first; the ones that cannot
  // (away, lost, sealed, benched) after them, each saying why. "Three
  // picked" does not move a chip: a squad being swapped should not jump.
  const shelf = [...copies.filter(isFree), ...copies.filter((copy) => !isFree(copy))];

  const summary = (
    <p data-testid="squad-shine" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-steel">
      <span>
        <b className="font-semibold text-white">{full ? "3 picked" : `${picked.size} of ${SQUAD_SIZE} picked`}</b>
      </span>
      <span aria-hidden>·</span>
      <span>
        <Term term="power">power</Term> <b className="font-mono font-semibold text-mint">{power}</b>
      </span>
      {edges ? (
        <>
          <span aria-hidden>·</span>
          <span>
            <Term term="edge">edges</Term> <span className="text-white">{edges}</span>
          </span>
        </>
      ) : null}
    </p>
  );

  return (
    <section aria-labelledby="step-squad" data-testid="step-squad" className="step-card" data-done={full ? "true" : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StepHeading n={1} done={full} id="step-squad">
          Pick three cards
        </StepHeading>
        {copies.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {collapsed ? (
              <button type="button" onClick={onChange} className="min-h-11 min-w-11 rounded-full border border-line px-4 text-sm font-semibold text-white hover:border-steel">
                Change
              </button>
            ) : picked.size > 0 ? (
              <button type="button" onClick={onClear} className="min-h-11 min-w-11 px-3 text-sm text-steel underline-offset-4 hover:text-white hover:underline">
                Clear
              </button>
            ) : null}
            <button
              type="button"
              data-testid="suggest-squad"
              onClick={onSuggest}
              disabled={!canSuggest}
              aria-describedby={canSuggest ? undefined : "suggest-reason"}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-panel px-4 text-sm font-semibold text-white transition hover:border-coral/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ExpeditionIcon name="spark" className="text-gold" />
              {collapsed ? "Suggest another" : "Suggest a squad"}
            </button>
          </div>
        ) : null}
      </div>

      {copies.length === 0 ? (
        <EmptyShelf base={base} goal="send a squad out" />
      ) : (
        <>
          {collapsed ? null : (
            <p className="text-sm text-steel">
              Tap three cards. Their <Term term="power">power</Term> adds up, and each route asks for a total.
            </p>
          )}
          {summary}
          {canSuggest ? null : (
            <p id="suggest-reason" data-reason className="text-xs text-steel">
              Fewer than three cards are home, so there is nothing to suggest.
            </p>
          )}
          {!anyFree ? (
            <p className="flex items-center gap-2 rounded-lg border border-line bg-canvas/40 px-3 py-2 text-sm text-white">
              <ExpeditionIcon name="clock" className="text-gold" />
              Everyone is out or resting{nextBack ? ` — next back at ${easternClock(nextBack)} ET` : ""}.
            </p>
          ) : null}
          {collapsed ? (
            <p className="text-sm text-white">
              {squad.map((copy) => copy.playerName).join(", ")}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {shelf.map((copy) => {
                const lost = lostIds.has(copy.id);
                const deployed = deployedIds.has(copy.id) && !lost;
                const selected = picked.has(copy.id);
                const status = statusOf(copy, { lost, deployed, awayUntil: awayUntil.get(copy.id) ?? null, now, full, selected });
                const worth = shineOf(copy);
                const mutation = copy.card?.mutation ? mutationByKey(copy.card.mutation.key) : undefined;
                const title = trailTitleOf(copy);
                const edge = abilityOf(copy);
                const teamKey = cardTeamKey(copy);
                // Only worth saying on a card that could go tonight.
                const tonight = teamKey !== null && playingKeys.has(teamKey) && isFree(copy);
                const trail = trailLine(copy);
                return (
                  <li key={copy.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onToggle(copy.id)}
                      disabled={status !== null}
                      aria-pressed={selected}
                      aria-label={`${copy.playerName} — ${worth} shine${trail ? ` — ${trail}` : ""}`}
                      title={[status && status.icon !== "check" ? status.title : null, trail].filter(Boolean).join(" ") || undefined}
                      className={`flex h-full min-h-11 w-full flex-col items-stretch gap-1 rounded-lg border px-2.5 py-2 text-left transition disabled:cursor-not-allowed ${
                        selected ? "border-coral bg-coral/15" : status ? "border-line/60 bg-panel/50" : "border-line bg-panel hover:border-coral/60"
                      }`}
                    >
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <span className={`truncate text-sm font-semibold ${status ? "text-steel" : "text-white"}`}>{copy.playerName}</span>
                        <span className="shrink-0 rounded-full border border-mint/50 bg-mint/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-mint">
                          power {worth}
                        </span>
                      </span>
                      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-steel">
                        <span>
                          {tierLabel(copy.tier)}
                          {copy.role ? ` · ${copy.role}` : ""}
                        </span>
                        {copy.foil ? (
                          <span className="inline-flex items-center gap-0.5 text-gold" title="Foil">
                            <ExpeditionIcon name="foil" size={11} />
                            foil
                          </span>
                        ) : null}
                        {copy.signed ? (
                          <span className="inline-flex items-center gap-0.5 text-gold">
                            <ExpeditionIcon name="signed" size={11} />
                            signed
                          </span>
                        ) : null}
                        {isProtected(copy) ? (
                          // The Eclipse is the one-of-one; a moment, a plate or
                          // a champions relic is protected the same way but is
                          // not unique, and a "1/1" on a plate read as a claim.
                          <span className="inline-flex items-center gap-0.5 text-purple-200">
                            <ExpeditionIcon name="relic" size={11} />
                            {copy.foilType === "eclipse" ? "1/1" : copy.card?.dribb ? `${copy.card.dribb.number}/${copy.card.dribb.of}` : "relic"}
                          </span>
                        ) : null}
                        {mutation ? <span style={{ color: mutation.accent }}>{mutation.label}</span> : null}
                        {title ? <span>{title.label}</span> : milesOf(copy) > 0 ? <span>{milesOf(copy)} mi</span> : null}
                        {wearOf(copy.card) > 0 && !copy.card?.slab ? <span>{gradeOf(copy.card).label}</span> : null}
                      </span>
                      <span data-edge-title className="flex min-w-0 items-center gap-1 text-[11px] text-gold/90">
                        <ExpeditionIcon name="edge" size={11} />
                        <span className="truncate">{edge.title}</span>
                      </span>
                      {tonight ? (
                        <span
                          data-testid={`plays-${copy.id}`}
                          className="inline-flex w-fit items-center gap-1 rounded-full border border-mint/60 bg-mint/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mint"
                        >
                          plays tonight · +{Math.round(SURGE_BONUS * 100)}%
                        </span>
                      ) : null}
                      {status ? (
                        <span data-reason className={`flex items-center gap-1 text-[11px] font-semibold ${status.tone}`}>
                          <ExpeditionIcon name={status.icon} size={11} />
                          {status.reason}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
