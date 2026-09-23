"use client";

// Steps 2 and 3 — pick a run, send them out.
//
// One row of route pills instead of eight cards: each pill says in two
// words whether this squad can go ("needs 12 power", "out now"), and ONE
// route card under the row says what the selected route is, what it pays,
// what it can do to a card, every reason it is shut — before any click —
// and only the options that apply to it. The launch button sits under the
// consent sentence, and a refused launch is printed under the button that
// was pressed.
//
// The board's word for what a squad adds up to is "power" (the chips say
// "power 7"); the rules' word is shine. Everything printed here says
// power — the requirement line, and squadMeets' reasons, which are the
// rules' sentences word for word except for that one word.

import { Fragment, useEffect, useRef } from "react";
import { fmtPoints } from "@/lib/betting/format";
import { forgedPolicyState, tierSlots, type CampState } from "@/lib/expeditions/camp";
import { CAMPAIGNS, canBind, type CampaignState } from "@/lib/expeditions/campaigns";
import {
  BRIEF_BONUS,
  EXPEDITION_TIERS,
  INSURANCE_FEE,
  SQUAD_SIZE,
  SURGE_BONUS,
  insurancePerWeek,
  payoutRange,
  type CardCopy,
  type DailyBrief,
  type ExpeditionTierKey,
} from "@/lib/expeditions/config";
import type { LostHold } from "@/lib/expeditions/queries";
import { FRAGMENT_CHANCE, consentLine } from "@/lib/expeditions/routes";
import { boardBlocked, type RouteGate } from "@/lib/expeditions/suggest";
import type { LeagueBoard } from "@/lib/expeditions/league";
import { WEATHERS, type WeatherKey } from "@/lib/expeditions/weather";
import { ForgedPolicyToggle } from "../CampPanel";
import { NO_REQUIREMENTS, RISK_CLASS, RISK_LABEL, requirementParts } from "../ExpeditionRules";
import { LeagueGoalLine } from "../LeagueGoalPanel";
import ExpeditionIcon, { type ExpeditionIconName } from "../expeditionIcons";
import StepHeading from "./StepHeading";
import Term from "./Term";

/** The row's order: the ladder, the errands, the patrons' road, the deep. */
export const ROUTE_PILL_ORDER: ExpeditionTierKey[] = ["scout", "raid", "legend", "rescue", "exorcism", "gilded", "legendary", "mythic"];

const PILL_LABEL: Record<ExpeditionTierKey, string> = {
  scout: "Scouting Run",
  raid: "Deep Raid",
  legend: "Legend Hunt",
  rescue: "Rescue",
  exorcism: "Exorcism",
  gilded: "Gilded Road",
  legendary: "Legendary",
  mythic: "Mythic",
};

const RISK_ICON: Record<string, ExpeditionIconName> = { none: "safe", wounded: "wounded", lost: "lost", dead: "dead" };

type ConvoyMode = "solo" | "new" | "join";

function hoursAway(hours: number): string {
  return hours >= 48 && hours % 24 === 0 ? `${hours / 24} days` : `${hours}h`;
}

/** A gate's sentence in the board's word: squadMeets says "needs 20
 *  shine — this squad has 12", the board "needs 20 power". Nothing else
 *  in the sentence changes. */
export function inPowerWords(text: string): string {
  return text.replace(/\bshine\b/g, "power");
}

export default function RouteStep({
  route,
  gates,
  squad,
  onRoute,
  brief,
  weather,
  playingToday,
  fragments,
  patron,
  freePolicy,
  insuranceLeft,
  insured,
  onInsured,
  camp = null,
  forgedThisWeek = null,
  forged = false,
  onForged = () => {},
  runsOut = 0,
  league = null,
  onOpenLeague,
  convoyMode,
  onConvoyMode,
  joinCode,
  onJoinCode,
  holds,
  byId,
  rescueTarget,
  onRescueTarget,
  afflicted,
  cleanseTarget,
  onCleanseTarget,
  campaign,
  busy,
  sending,
  launchError,
  onLaunch,
}: {
  route: ExpeditionTierKey;
  gates: Record<ExpeditionTierKey, RouteGate>;
  squad: CardCopy[];
  onRoute: (tier: ExpeditionTierKey) => void;
  brief: DailyBrief;
  weather: WeatherKey | null;
  playingToday: string[];
  fragments: number;
  patron: boolean;
  freePolicy: boolean;
  insuranceLeft: number;
  insured: boolean;
  onInsured: (value: boolean) => void;
  /** The base camp (fetchCamp): its forged policies for the route card,
   *  and the Scouting Run's second slot. Null when there is none. */
  camp?: CampState | null;
  /** Forged launches this Eastern week; null when unread. */
  forgedThisWeek?: number | null;
  /** Whether "Use a forged policy" is ticked. */
  forged?: boolean;
  onForged?: (value: boolean) => void;
  /** This route's runs in the field right now. */
  runsOut?: number;
  /** The league goal, for the This-week line; null hides it. */
  league?: LeagueBoard | null;
  /** Opens the League tab. */
  onOpenLeague?: () => void;
  convoyMode: ConvoyMode;
  onConvoyMode: (mode: ConvoyMode) => void;
  joinCode: string;
  onJoinCode: (code: string) => void;
  holds: LostHold[];
  byId: Map<number, CardCopy>;
  rescueTarget: number | null;
  onRescueTarget: (holdId: number | null) => void;
  /** Haunted or Cursed cards in the squad, for the Exorcism. */
  afflicted: CardCopy[];
  cleanseTarget: number | null;
  onCleanseTarget: (id: number) => void;
  campaign: CampaignState | null;
  busy: boolean;
  /** The route being launched right now, if any. */
  sending: ExpeditionTierKey | null;
  launchError: string | null;
  onLaunch: (tier: ExpeditionTierKey) => void;
}) {
  const row = useRef<HTMLDivElement | null>(null);
  const def = EXPEDITION_TIERS[route];
  const gate = gates[route];
  const range = payoutRange(route);
  const risky = def.risk !== "none";
  const binds = campaign !== null && canBind(campaign, route);
  const blocked = !gate.ok || busy;
  const forgedState = forgedPolicyState(camp, forgedThisWeek, route);
  const forgedHere = forged && forgedState !== null && forgedState.reason === null;
  const insuredHere = insured && insuranceLeft > 0 && risky && !forgedHere;
  /** Covered either way: the week's policy, or one from the forge. */
  const coveredHere = insuredHere || forgedHere;
  const needs = requirementParts(def);
  const slots = tierSlots(camp, route);

  // Keep the selected pill in view on a phone: a preselected Legend Hunt
  // is the third pill, off the edge of a 390px row.
  useEffect(() => {
    const container = row.current;
    const pill = container?.querySelector<HTMLElement>(`[data-testid="route-pill-${route}"]`);
    if (!container || !pill) return;
    const left = pill.offsetLeft - container.offsetLeft;
    if (left < container.scrollLeft || left + pill.offsetWidth > container.scrollLeft + container.clientWidth) {
      container.scrollLeft = Math.max(0, left - 16);
    }
  }, [route]);

  const launchLabel =
    sending === route
      ? "Sending…"
      : gate.context.out
        ? "Still out there"
        : gate.context.patron
          ? "Patrons only"
          : def.risk === "dead"
            ? "Send them in, knowing"
            : "Send them out";
  const notReady =
    boardBlocked(gate)
      ? "This run is shut — the card above says why."
      : squad.length < SQUAD_SIZE
        ? `Pick ${SQUAD_SIZE - squad.length} more card${SQUAD_SIZE - squad.length === 1 ? "" : "s"} in step 1.`
        : "This squad can't go on this run yet — the card above says why.";

  return (
    <>
      <section aria-labelledby="step-route" data-testid="step-route" className="step-card">
        <StepHeading n={2} id="step-route">
          Pick a run
        </StepHeading>

        <div
          ref={row}
          role="group"
          aria-label="Routes"
          data-testid="route-pills"
          className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5"
        >
          {ROUTE_PILL_ORDER.map((key) => {
            const pill = gates[key];
            const selected = key === route;
            const icon: ExpeditionIconName | null = pill.state === "ready" ? "check" : pill.state === "out" ? "clock" : pill.state === "locked" ? "lock" : null;
            const note = pill.short ?? hoursAway(EXPEDITION_TIERS[key].durationHours);
            return (
              <button
                key={key}
                type="button"
                data-testid={`route-pill-${key}`}
                aria-pressed={selected}
                aria-label={`${PILL_LABEL[key]}: ${pill.state === "ready" ? "this squad can go" : note}`}
                onClick={() => onRoute(key)}
                className="route-pill"
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
                  {icon ? (
                    <ExpeditionIcon
                      name={icon}
                      className={pill.state === "ready" ? "text-mint" : pill.state === "out" ? "text-gold" : "text-steel"}
                    />
                  ) : null}
                  {PILL_LABEL[key]}
                </span>
                <span className={`text-[11px] ${pill.state === "ready" ? "text-mint" : pill.state === "idle" ? "text-steel" : "text-gold"}`}>
                  {pill.state === "ready" ? "ready" : note}
                </span>
              </button>
            );
          })}
        </div>

        {/* This week, in one line: what changes the road for every run —
            and under it, the league's shared goal, which opens its tab. */}
        <div data-testid="expedition-brief" className="flex flex-col">
          <p className="text-sm leading-7 text-steel">
            <span className="label-dash mr-2">This week</span>
            <Term term="brief">
              <span className="font-semibold text-white">{brief.label} — +{Math.round(BRIEF_BONUS * 100)}% yield</span>
            </Term>{" "}
            <span>(send a {brief.role})</span>
            {weather ? (
              <>
                <span aria-hidden> · </span>
                <Term term="weather" testId="expedition-weather" extra={`${WEATHERS[weather].sky} ${WEATHERS[weather].does.join(" ")}`}>
                  <span aria-hidden className="mr-1 inline-block">
                    {WEATHERS[weather].glyph}
                  </span>
                  <span className="font-semibold text-white">{WEATHERS[weather].label}</span>
                </Term>
              </>
            ) : null}
            {playingToday.length > 0 ? (
              <>
                <span aria-hidden> · </span>
                <span data-testid="match-day">
                  <Term term="matchDay">
                    <span className="font-semibold text-mint">Match day</span>
                  </Term>
                  : {playingToday.join(", ")} {playingToday.length === 1 ? "plays" : "play"} tonight, +{Math.round(SURGE_BONUS * 100)}%
                </span>
              </>
            ) : null}
            <span aria-hidden> · </span>
            <Term term="fragment" buttonTestId="fragments">
              <ExpeditionIcon name="fragment" className="mr-1 text-purple-200" />
              {fragments}/{EXPEDITION_TIERS.legendary.fragments} map fragment{fragments === 1 ? "" : "s"}
            </Term>
          </p>
          <LeagueGoalLine league={league} onOpen={onOpenLeague} />
        </div>

        <article
          data-testid={`tier-${route}`}
          className={`flex flex-col gap-3 rounded-xl border p-4 ${gate.ok ? "border-mint/50" : def.patron ? "border-gold/40" : "border-line"} bg-canvas/40`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="type-display flex flex-wrap items-center gap-2 text-2xl">
                {def.label}
                {def.patron ? (
                  <span
                    data-testid={`tier-${route}-patron`}
                    className="rounded-full border border-gold/70 bg-gold/15 px-2 py-0.5 font-body text-[10px] font-black not-italic uppercase tracking-[0.18em] text-gold"
                  >
                    Patrons
                  </span>
                ) : null}
              </h3>
              <p className="mt-0.5 text-xs uppercase tracking-wide text-steel">
                {def.durationHours} hours away · {def.forks} fork{def.forks === 1 ? "" : "s"}
              </p>
            </div>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${RISK_CLASS[def.risk]}`}>
              <ExpeditionIcon name={RISK_ICON[def.risk]} size={12} />
              {RISK_LABEL[def.risk]}
            </span>
          </div>

          <p className="max-w-3xl text-sm text-steel">{def.what}</p>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="label-dash">Pays</dt>
              <dd className="mt-1 text-white">
                {range.max === 0 ? (
                  <span className="text-steel">Nothing — the card comes home clean.</span>
                ) : (
                  <>
                    <span className="font-mono font-bold text-mint">
                      {fmtPoints(range.min)}–{fmtPoints(range.max)}
                    </span>{" "}
                    <span className="text-steel">
                      in betting dollars, more each time you <Term term="push">go for it</Term>
                      {def.forks > 0 ? (
                        <>
                          {" "}
                          at a <Term term="fork">fork</Term>
                        </>
                      ) : null}
                      .
                    </span>
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt className="label-dash">Needs</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-x-2 text-white">
                <span data-testid={`tier-${route}-needs`}>
                  {needs.length === 0
                    ? NO_REQUIREMENTS
                    : needs.map((part, index) => (
                        <Fragment key={part.text}>
                          {index > 0 ? " · " : null}
                          {part.power !== undefined ? (
                            <>
                              <Term term="power">power</Term> {part.power}
                            </>
                          ) : (
                            part.text
                          )}
                        </Fragment>
                      ))}
                </span>
                {gate.ok ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-mint">
                    <ExpeditionIcon name="check" size={12} />
                    this squad has it
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>

          {binds ? (
            <p
              data-testid={`tier-${route}-campaign`}
              className="flex items-start gap-1.5 text-xs font-semibold"
              style={{ color: CAMPAIGNS[campaign.key].accent }}
            >
              <ExpeditionIcon name="campaign" className="mt-px" />
              <span>
                Stage {campaign.stage + 1} of {CAMPAIGNS[campaign.key].label} — this launch walks it
                {campaign.road ? ", on the road the last stage set" : ""}. Not in a convoy.
              </span>
            </p>
          ) : null}

          {slots > 1 && runsOut > 0 && !gate.context.out ? (
            <p data-testid={`tier-${route}-slot`} className="flex items-start gap-1.5 text-xs font-semibold text-mint">
              <ExpeditionIcon name="check" className="mt-px" />
              <span>
                {runsOut === 1 ? `One ${def.label} is out` : `${runsOut} ${def.label}s are out`}; your camp&apos;s second squad slot lets
                another go.
              </span>
            </p>
          ) : null}

          {/* Why can't I? Every reason, before any click. */}
          {!gate.ok && (squad.length > 0 || gate.state !== "idle") ? (
            <div id={`why-${route}`} data-reason className="flex flex-col gap-1.5 rounded-lg border border-coral/40 bg-coral/5 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-semibold text-white">
                <ExpeditionIcon name="lock" className="text-coral" />
                Why this can&apos;t go yet
              </p>
              {gate.context.out ? (
                <p data-testid={`tier-${route}-out`} className="text-gold">
                  {slots > 1
                    ? `Both squads are in the field. Your camp sends ${slots} ${def.label}s at a time — bring one home first.`
                    : `Already in the field. One ${def.label} at a time — bring this one home first.`}
                </p>
              ) : null}
              {gate.context.patron ? (
                <p data-testid={`tier-${route}-locked`} className="text-gold">
                  A patron perk. The road opens with the flame: {def.minSigned} signed cards to set out, and the biggest bag on the board.
                  Every other run&apos;s odds are untouched.
                </p>
              ) : null}
              {gate.context.noHold ? <p className="text-steel">Nothing is lost. A Rescue needs a card to go after.</p> : null}
              {gate.context.afflicted ? <p className="text-coral">Put a Haunted or Cursed card in the squad to cleanse it.</p> : null}
              {gate.context.fragments ? (
                <p className="text-coral">
                  {`Needs ${def.fragments} map fragments — you hold ${fragments}.`} They come home with Legend Hunts (every jackpot,{" "}
                  {Math.round((FRAGMENT_CHANCE.legend?.solid ?? 0) * 100)}% of solid runs) and Deep Raid jackpots (
                  {Math.round((FRAGMENT_CHANCE.raid?.jackpot ?? 0) * 100)}%).
                </p>
              ) : null}
              {squad.length > 0 && gate.squad.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {gate.squad.map((reason) => (
                    <li key={reason} className="text-coral">
                      {inPowerWords(reason)}
                    </li>
                  ))}
                </ul>
              ) : gate.context.legendMark ? (
                <p className="text-coral">The Mythic route needs a Legend mark on your shelf.</p>
              ) : null}
            </div>
          ) : !gate.ok && squad.length === 0 ? (
            <p className="flex items-center gap-1.5 text-sm text-steel">
              <ExpeditionIcon name="info" />
              Pick three cards in step 1 and this card says whether they can go.
            </p>
          ) : null}

          {/* Only the options that apply to this route. */}
          {risky ? (
            <div className="flex flex-wrap items-stretch gap-2">
              <label
                className={`relative flex min-h-11 flex-1 basis-64 items-center gap-3 rounded-lg border px-3 py-2 ${
                  insuranceLeft === 0 ? "cursor-not-allowed border-line/60" : "cursor-pointer border-line hover:border-steel"
                }`}
              >
                <input
                  type="checkbox"
                  checked={insuredHere}
                  disabled={insuranceLeft === 0}
                  onChange={(event) => onInsured(event.target.checked)}
                  aria-label="Insure this run"
                  aria-describedby="insurance-note"
                  className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-lg opacity-0 disabled:cursor-not-allowed"
                />
                <span
                  aria-hidden
                  className="grid h-5 w-5 shrink-0 place-content-center rounded border border-steel text-canvas peer-checked:border-gold peer-checked:bg-gold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus peer-disabled:opacity-40"
                >
                  {insuredHere ? <ExpeditionIcon name="check" size={12} /> : null}
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-white">Insure this run</span>
                  <span id="insurance-note" data-testid="insurance-note" data-reason className="text-xs text-steel">
                    {insuranceLeft === 0
                      ? `spent for the week — ${insurancePerWeek(false)} a week, ${insurancePerWeek(true)} for patrons`
                      : `${freePolicy ? "free this week (patron)" : `${fmtPoints(INSURANCE_FEE)} at launch`} · ${insuranceLeft} of ${insurancePerWeek(patron)} left this week — lost becomes wounded, dead becomes lost`}
                  </span>
                </span>
              </label>
              {/* The forge's policy stands in for the week's: ticking one
                  unticks the other (the board), and a launch carries one
                  or neither. */}
              {forgedState ? (
                <div className="flex-1 basis-64">
                  <ForgedPolicyToggle camp={camp} forgedThisWeek={forgedThisWeek} tier={route} checked={forgedHere} onChange={onForged} />
                </div>
              ) : null}
              <span className="self-center">
                <Term term="insurance" variant="chip">
                  What&apos;s insurance?
                </Term>
              </span>
            </div>
          ) : null}

          {def.forks > 0 && !binds ? (
            <details className="group rounded-lg border border-line" open={convoyMode !== "solo" || undefined}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-semibold text-white">
                <ExpeditionIcon name="chevron" className="text-steel transition group-open:rotate-90" />
                <ExpeditionIcon name="convoy" className="text-gold" />
                Ride with a friend
                <span className="text-xs font-normal text-steel">{convoyMode === "solo" ? "optional" : convoyMode === "new" ? "starting a convoy" : "joining a convoy"}</span>
              </summary>
              <div className="flex flex-col gap-2 border-t border-line/60 p-3 text-sm">
                <p className="text-xs text-steel">
                  Two squads, one clock, one set of forks — a fork pushes only if you both push. <Term term="convoy">How convoys work</Term>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    data-testid="convoy-mode"
                    aria-label="Convoy"
                    value={convoyMode}
                    onChange={(event) => onConvoyMode(event.target.value as ConvoyMode)}
                    className="input-brand min-h-11 px-2 text-sm"
                  >
                    <option value="solo">Go alone</option>
                    <option value="new">Start a convoy — get a code</option>
                    <option value="join">Join a convoy with a code</option>
                  </select>
                  {convoyMode === "join" ? (
                    <input
                      aria-label="Convoy code"
                      value={joinCode}
                      onChange={(event) => onJoinCode(event.target.value.toUpperCase())}
                      maxLength={8}
                      placeholder="ABC234"
                      className="input-brand min-h-11 w-32 px-2 font-mono text-sm uppercase"
                    />
                  ) : null}
                </div>
                <p className="text-xs text-steel">
                  {convoyMode === "solo"
                    ? "Start one and share the code, or join with a friend's."
                    : convoyMode === "new"
                      ? "A partner joins the same route with your code before the first fork opens."
                      : "The same route as the host, before their first fork opens."}
                </p>
              </div>
            </details>
          ) : null}

          {def.target === "lost" && holds.length > 0 ? (
            <label className="flex flex-wrap items-center gap-2 text-sm text-white">
              Go after
              <select
                value={rescueTarget ?? ""}
                onChange={(event) => onRescueTarget(event.target.value ? Number(event.target.value) : null)}
                className="input-brand min-h-11 px-2 text-sm"
              >
                {holds.map((hold) => (
                  <option key={hold.holdId} value={hold.holdId}>
                    {byId.get(hold.cardId)?.playerName ?? `#${hold.cardId}`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {def.target === "afflicted" && afflicted.length > 0 ? (
            <label className="flex flex-wrap items-center gap-2 text-sm text-white">
              Cleanse
              <select
                value={cleanseTarget ?? afflicted[0].id}
                onChange={(event) => onCleanseTarget(Number(event.target.value))}
                className="input-brand min-h-11 px-2 text-sm"
              >
                {afflicted.map((copy) => (
                  <option key={copy.id} value={copy.id}>
                    {copy.playerName} ({copy.card?.mutation?.key})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </article>
      </section>

      <section aria-labelledby="step-send" data-testid="step-send" className="step-card">
        <StepHeading n={3} id="step-send">
          Send them out
        </StepHeading>
        <p
          data-testid={`consent-${route}`}
          className={`flex items-start gap-2 text-sm ${def.risk === "none" ? "text-steel" : def.risk === "dead" ? "text-red-300" : "text-gold"}`}
        >
          {consentLine(route, squad, coveredHere)}
        </p>
        <p className="text-xs text-steel">
          {[
            def.fee > 0 ? `${fmtPoints(def.fee)} fee at launch` : "Free to send",
            insuredHere
              ? freePolicy
                ? "insurance free this week"
                : `${fmtPoints(INSURANCE_FEE)} for insurance`
              : forgedHere
                ? "insured with a forged policy, no fee"
                : null,
            def.fragments > 0 ? `uses ${def.fragments} map fragments` : null,
            `back in ${hoursAway(def.durationHours)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
          .
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => onLaunch(route)}
            disabled={blocked}
            aria-label={`Launch ${def.label}`}
            aria-describedby={blocked ? "launch-reason" : undefined}
            className={`min-h-11 w-full px-6 text-sm sm:w-auto ${
              gate.ok
                ? def.risk === "dead"
                  ? "rounded-full border border-red-400/70 bg-red-500/10 font-bold text-red-200 hover:bg-red-500/20"
                  : "btn-coral"
                : "cursor-not-allowed rounded-full border border-line bg-panel font-semibold text-steel"
            }`}
          >
            {launchLabel}
          </button>
          {blocked && !busy ? (
            <span id="launch-reason" data-reason className="text-xs text-steel">
              {notReady}
            </span>
          ) : null}
        </div>
        {launchError ? (
          <p data-testid="expedition-error" role="alert" className="text-sm text-red-400">
            {launchError}
          </p>
        ) : null}
      </section>
    </>
  );
}
