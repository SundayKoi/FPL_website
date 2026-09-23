"use client";

// The claim ceremony: what a run brought home, over the board — the
// dollars, every event on the route, and every card with the state it came
// home in, drawn through PlayerCard3D with the mutation it now wears. A
// state and not a page: what a run brought back exists for exactly one
// render. Moved out of ExpeditionBoard, with two additions: the edges that
// fired, grouped by title, above the event list; and the atlas's news — a
// place this squad was first in the league to reach, a road it finished.

import { useEffect, useRef } from "react";
import CountUp from "@/components/home/CountUp";
import { fmtPoints } from "@/lib/betting/format";
import { mutationByKey } from "@/lib/cards/mutations";
import { firstReachedLine, roadWalkedLine } from "@/lib/expeditions/atlasWords";
import { CAMPAIGNS, type CampaignState } from "@/lib/expeditions/campaigns";
import {
  BRIEF_BONUS,
  MARK_RANK,
  SURGE_BONUS,
  briefFor,
  type CardCopy,
  type ExpeditionMark as ExpeditionMarkKind,
  type ExpeditionOutcome,
  type ExpeditionTierKey,
  type OutcomeGrade,
} from "@/lib/expeditions/config";
import type { ExpeditionRun } from "@/lib/expeditions/queries";
import type { CardFate, RouteResult } from "@/lib/expeditions/routes";
import type { ClaimAtlas } from "@/lib/expeditions/runs";
import { MILES_BY_TIER, milesOf, trailTitleOf } from "@/lib/expeditions/trail";
import { easternDateOf } from "@/lib/packs/week";
import ExpeditionIcon from "../expeditionIcons";
import PlayerCard3D from "../PlayerCard3D";
import { easternClock } from "./clock";

/** How a claim reads before you get to the numbers. */
const GRADE_HEADLINE: Record<OutcomeGrade, string> = {
  poor: "They made it back",
  solid: "A good run",
  jackpot: "They struck gold",
};

const FATE_LABEL: Record<CardFate["fate"], string> = {
  home: "Home",
  wounded: "Wounded",
  lost: "Lost",
  dead: "Dead",
};

const FATE_CLASS: Record<CardFate["fate"], string> = {
  home: "text-mint",
  wounded: "text-gold",
  lost: "text-coral",
  dead: "text-red-300",
};

export interface Ceremony {
  /** The run that just came home — the ceremony needs its LAUNCH day to
   *  name the brief the payout was scored against. */
  run: ExpeditionRun;
  outcome: ExpeditionOutcome;
  route: RouteResult;
  baseDollars: number;
  merchant: number;
  stranded: { holdId: number; bounty: number } | null;
  surge: string[];
  echo: { inventoryId: number; slug: string; playerName: string; moment: number } | null;
  bearerId: number | null;
  balance: number;
  fragments: number;
  /** The rescue went right and the card was already gone — buried by the
   *  deadline, ransomed, or carried home by somebody else while this squad
   *  was out. The run still resolves; the ceremony must say so rather than
   *  announcing a rescue that returned nothing. */
  rescueMissed: boolean;
  /** The campaign this run walked for, advanced by the claim. */
  campaign: { key: CampaignState["key"]; stage: number; finished: boolean; relicName: string | null } | null;
  /** The atlas's news from this claim: the places this squad was first in
   *  the league to reach (titles), and the road it finished. Null or
   *  absent when there is none. */
  atlas?: ClaimAtlas | null;
}

/**
 * What a run brought home, over the board: the dollars, every event on the
 * route, and every card with the state it came home in — drawn through
 * PlayerCard3D with the mutation it now wears.
 */
export default function ClaimCeremony({
  ceremony,
  copies,
  onClose,
}: {
  ceremony: Ceremony;
  copies: Map<number, CardCopy>;
  onClose: () => void;
}) {
  const { outcome, route, bearerId, balance, baseDollars, fragments, merchant, stranded, surge, echo, rescueMissed } = ceremony;
  const tier = ceremony.run.tier as ExpeditionTierKey;
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bearer = bearerId === null ? undefined : copies.get(bearerId);
  const worn = bearer?.card?.expedition?.mark ?? null;
  const shownMark: ExpeditionMarkKind | null =
    outcome.mark && (!worn || MARK_RANK[outcome.mark] > MARK_RANK[worn]) ? outcome.mark : worn;

  // The edges that made something happen on this road (from rules 6):
  // each title once, with what it did, above the full list of events.
  const fired = [...route.events.filter((event) => event.ability).reduce((byTitle, event) => {
    byTitle.set(event.ability!, [...(byTitle.get(event.ability!) ?? []), event.text]);
    return byTitle;
  }, new Map<string, string[]>())].map(([title, texts]) => ({ title, texts }));

  const changed = route.fates.filter((fate) => fate.fate !== "home" || fate.mutation || fate.id === bearerId);
  const dead = route.fates.filter((fate) => fate.fate === "dead");
  const headline = dead.length > 0 ? (dead.length === route.fates.length ? "Nobody came home" : "Not everyone came home") : GRADE_HEADLINE[outcome.grade];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Expedition results"
      data-testid="expedition-ceremony"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/85 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="card-brand my-auto flex w-full max-w-3xl flex-col items-center gap-4 p-6 text-center"
      >
        <span className="label-dash">
          {route.rescued === true
            ? rescueMissed
              ? "Too late"
              : "Rescued"
            : route.rescued === false
              ? "The rescue failed"
              : route.cleansed !== null
                ? "Exorcised"
                : outcome.grade === "jackpot"
                  ? "Jackpot"
                  : "The squad is home"}
        </span>
        <h2 className="type-display text-3xl sm:text-4xl">{headline}</h2>
        {rescueMissed ? (
          <p className="max-w-prose text-sm text-coral">
            The squad reached the spot and found nothing. The card had already gone — the seven days ran out, it was
            ransomed, or another collector&apos;s route carried it home first. Your squad is back and the run is
            closed.
          </p>
        ) : null}

        {outcome.dollars > 0 ? (
          <>
            <p className="type-display text-4xl text-mint sm:text-5xl">
              <span aria-hidden>$</span>
              <CountUp value={outcome.dollars} />
              <span className="sr-only"> betting dollars</span>
            </p>
            <p className="text-xs text-steel">
              {route.lootMultiplier !== 1 ? `${fmtPoints(baseDollars)} × ${route.lootMultiplier} from the forks · ` : ""}
              {surge.length > 0 ? `× ${1 + SURGE_BONUS} match day · ` : ""}
              {merchant > 0 ? `+${fmtPoints(merchant)} from a merchant on the trail · ` : ""}Balance {fmtPoints(balance)}
            </p>
          </>
        ) : null}

        {outcome.briefHit ? (
          <p className="text-sm text-gold">
            {briefFor(easternDateOf(new Date(ceremony.run.startedAt))).label} — the brief paid +{Math.round(BRIEF_BONUS * 100)}%.
          </p>
        ) : null}
        {surge.length > 0 ? (
          <p data-testid="ceremony-surge" className="text-sm text-mint">
            {surge.join(" and ")} played on launch day — the match-day surge paid +{Math.round(SURGE_BONUS * 100)}%.
          </p>
        ) : null}
        {MILES_BY_TIER[tier] > 0 && route.fates.some((fate) => fate.fate === "home" || fate.fate === "wounded") ? (
          <p data-testid="ceremony-miles" className="text-sm text-steel">
            <span className="font-semibold" style={{ color: "#e0b45a" }}>+{MILES_BY_TIER[tier]} mile{MILES_BY_TIER[tier] === 1 ? "" : "s"}</span> for everyone who came home.
            {route.fates
              .filter((fate) => fate.fate === "home" || fate.fate === "wounded")
              .map((fate) => {
                const copy = copies.get(fate.id);
                const miles = (copy ? milesOf(copy) : 0) + MILES_BY_TIER[tier];
                const title = copy ? trailTitleOf({ card: { trail: { miles } } }) : null;
                const before = copy ? trailTitleOf(copy) : null;
                return title && title.key !== before?.key ? ` ${copy!.playerName} is ${title.label} now.` : "";
              })
              .join("")}
          </p>
        ) : null}
        {outcome.comp ? (
          <p className="text-sm text-gold">They came back with a free pack — it&apos;s waiting in the shop.</p>
        ) : null}
        {ceremony.campaign ? (
          <p data-testid="ceremony-campaign" className="text-sm" style={{ color: CAMPAIGNS[ceremony.campaign.key].accent }}>
            {ceremony.campaign.finished
              ? `${CAMPAIGNS[ceremony.campaign.key].label} is finished. ${ceremony.campaign.relicName ? `A relic of ${ceremony.campaign.relicName} was printed in the campaign's frame — it's on your shelf.` : "Nobody came home from the finale to carry the relic."}`
              : `Stage ${ceremony.campaign.stage} of 3 of ${CAMPAIGNS[ceremony.campaign.key].label} is done. The road ahead is set.`}
          </p>
        ) : null}
        {ceremony.atlas && ceremony.atlas.firsts.length > 0 ? (
          <p data-testid="ceremony-firsts" className="max-w-prose text-sm text-gold">
            {firstReachedLine(ceremony.atlas.firsts)}
          </p>
        ) : null}
        {ceremony.atlas?.road ? (
          <p data-testid="ceremony-road" className="max-w-prose text-sm text-mint">
            {roadWalkedLine(ceremony.atlas.road.tier, ceremony.atlas.road)}
            {ceremony.atlas.road.comp ? " The free pack is waiting in the shop." : ""}
          </p>
        ) : null}
        {echo ? (
          <p data-testid="ceremony-echo" className="text-sm text-gold">
            The moment echoed. A copy of <strong className="text-white">{echo.playerName}</strong> from that game came home with them — it&apos;s on
            your shelf.
          </p>
        ) : null}
        {route.fragments > 0 ? (
          <p className="text-sm text-purple-200">A map fragment. You hold {fragments} — three open the Legendary route.</p>
        ) : null}
        {stranded ? (
          <p className="text-sm text-gold">
            They carried a stranger&apos;s lost card home. Its owner has it back, wounded, and you were paid a {fmtPoints(stranded.bounty)} bounty.
          </p>
        ) : null}

        {fired.length > 0 ? (
          <div data-testid="ceremony-edges" className="flex w-full max-w-xl flex-col gap-1 text-left">
            <p className="label-dash text-gold">Edges that fired</p>
            <ul className="flex flex-col gap-1 text-sm">
              {fired.map(({ title, texts }) => (
                <li key={title} data-testid={`ceremony-edge-${title}`} className="rounded-md border border-gold/40 bg-gold/5 px-3 py-1.5">
                  <span className="font-semibold text-gold">
                    <ExpeditionIcon name="edge" size={12} className="mr-1 inline" />
                    {title}
                    {texts.length > 1 ? ` · ${texts.length} times` : ""}
                  </span>
                  <span className="block text-xs text-steel">{texts.join(" ")}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {route.events.length > 0 ? (
          <ol data-testid="ceremony-events" className="flex w-full max-w-xl flex-col gap-1 text-left text-sm">
            {route.events.map((event, index) => (
              <li
                key={index}
                className={`rounded-md border px-3 py-1.5 ${
                  event.tone === "good" ? "border-mint/40 text-mint" : event.tone === "bad" ? "border-coral/50 text-coral" : "border-line text-steel"
                }`}
              >
                {event.text}
              </li>
            ))}
          </ol>
        ) : null}

        {changed.length > 0 ? (
          <div className="flex w-full flex-wrap justify-center gap-6">
            {changed.map((fate) => {
              const copy = copies.get(fate.id);
              if (!copy) return null;
              const mutated =
                fate.mutation && fate.fate !== "dead"
                  ? { ...copy.card, mutation: { key: fate.mutation, date: new Date().toISOString().slice(0, 10), run: ceremony.run.id } }
                  : copy.card;
              const card =
                fate.id === bearerId && shownMark
                  ? {
                      ...mutated,
                      expedition: {
                        mark: shownMark,
                        tier: copy.card?.expedition?.tier ?? "",
                        date: copy.card?.expedition?.date ?? new Date().toISOString().slice(0, 10),
                      },
                    }
                  : mutated;
              return (
                <div key={fate.id} data-testid={`fate-${fate.id}`} className={`flex flex-col items-center gap-2 ${fate.fate === "dead" ? "opacity-60 grayscale" : ""}`}>
                  <p className={`type-display text-lg ${FATE_CLASS[fate.fate]}`}>
                    {copy.playerName} — {fate.mutation ? mutationByKey(fate.mutation)?.label : FATE_LABEL[fate.fate]}
                    {fate.mutation && fate.fate !== "home" ? `, ${FATE_LABEL[fate.fate].toLowerCase()}` : ""}
                  </p>
                  <PlayerCard3D card={card} interactive forceFoil={copy.foil} foilType={copy.foilType} />
                  <p className="max-w-[20rem] text-xs text-steel">
                    {fate.fate === "dead"
                      ? "Gone for good. It rests in the graveyard."
                      : fate.fate === "lost"
                        ? "Did not come home. A week to rescue or ransom it."
                        : fate.fate === "wounded"
                          ? `Benched from expeditions until ${fate.woundedUntil ? easternClock(fate.woundedUntil) : "it heals"} ET.`
                          : fate.mutation
                            ? (mutationByKey(fate.mutation)?.tagline ?? "")
                            : `It wears the ${shownMark} mark from here on.`}
                  </p>
                </div>
              );
            })}
          </div>
        ) : null}

        <button ref={closeRef} type="button" onClick={onClose} className="btn-pill mt-2">
          Back to the board
        </button>
      </div>
    </div>
  );
}
