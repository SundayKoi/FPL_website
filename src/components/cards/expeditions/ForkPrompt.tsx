"use client";

// A fork the squad is standing at: where they are, two big choices, and
// every other way through folded under them.
//
// The two choices are the whole decision for most people: play it safe
// (camp) or go for it (the gentlest push this squad can make — a signed
// card's favour, then a foil's light, then the plain push). Everything
// else the squad could do — the rally, the role calls, the prints' options
// it cannot use yet, locked and saying why — sits in "More choices", so a
// fork is two buttons rather than eight. Silence is always named: if
// nobody answers by the deadline, the squad plays it safe.

import { MUTATIONS } from "@/lib/cards/mutations";
import { EXPEDITION_TIERS, type CardCopy, type ExpeditionTierKey } from "@/lib/expeditions/config";
import { convoyVerdict } from "@/lib/expeditions/convoy";
import { banterFor } from "@/lib/expeditions/journal";
import { hasRoad, hasTrail, roadOf, type ConvoyView, type ExpeditionRun } from "@/lib/expeditions/queries";
import { choiceSheet, forkOptions, forksFor, type ForkChoice, type ForkOption, type ForkView } from "@/lib/expeditions/routes";
import ExpeditionIcon from "../expeditionIcons";
import { easternClock, untilLabel, useClock } from "./clock";
import Term from "./Term";

/** The Legendary route's singing dark, when a one-roster squad's real
 *  next opponent is known: what is singing under the floor has a name.
 *  Keyed on the PLACE, not the slot — on a drawn road the second fork is
 *  one of three, and only one of them sings. */
export const RIVAL_FORK: { tier: ExpeditionTierKey; key: string } = { tier: "legendary", key: "singing" };

export function rivalStory(rival: string): string {
  return `Something is singing under the floor and the squad knows the song — it is ${rival}'s, and they are playing them next. There is light ahead, and the singing gets louder toward it.`;
}

/** The pushes "Go for it" prefers, gentlest first: a favour carries no
 *  risk, a light halves it, the plain push is always there. */
const GO_ORDER: ForkChoice[] = ["favour", "light", "push"];

/** Why a locked option is not worth a line of its own: it was never
 *  going to be this squad's (a coin flip) or it already happened. */
const QUIET_LOCKS = new Set(["Already spent on this run.", "Not on a coin flip."]);

/** The two big choices and the rest, for one fork. */
export function splitChoices(options: ForkOption[]): { safe: ForkOption | null; go: ForkOption | null; more: ForkOption[]; missing: ForkOption[] } {
  const safe = options.find((option) => option.choice === "camp") ?? null;
  const go = GO_ORDER.map((choice) => options.find((option) => option.choice === choice && option.locked === null)).find(Boolean) ?? null;
  // The role calls the squad can actually make are buttons; the ones it
  // cannot are one quiet line, so the list is not six grey buttons. The
  // prints' options stay listed and locked — that is where the page
  // teaches what a signature buys.
  const more = options.filter((option) => option !== safe && option !== go && (!option.role || option.locked === null));
  const missing = options.filter((option) => option.role && option.locked !== null && !QUIET_LOCKS.has(option.locked));
  return { safe, go, more, missing };
}

function ChoiceBody({ option, locked }: { option: ForkOption; locked: boolean }) {
  return (
    <>
      <span className="flex items-center gap-2 text-sm font-semibold text-inherit">
        {option.label}
        {option.role ? (
          <span className="rounded-full border border-gold/50 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-gold">{option.role}</span>
        ) : null}
      </span>
      {locked ? (
        <span data-reason className="flex items-center gap-1 text-xs font-medium text-steel">
          <ExpeditionIcon name="lock" size={12} />
          {option.locked}
        </span>
      ) : (
        // The edge sentences print on their own lines under the button
        // (EdgeLines); the button keeps what the choice itself does.
        <span className="text-xs font-medium opacity-90">{option.baseTease ?? option.tease}</span>
      )}
    </>
  );
}

/** "Unkillable: the first harm on Kai is ignored." — one line per edge the
 *  squad carries that changes THIS choice, under the choice it changes. */
function EdgeLines({ option }: { option: ForkOption }) {
  if (!option.edges || option.edges.length === 0) return null;
  return (
    <ul data-testid={`fork-edges-${option.choice}`} className="flex flex-col gap-0.5">
      {option.edges.map((edge) => (
        <li key={`${edge.copyId}-${edge.title}`} data-edge-title className="flex items-start gap-1.5 text-xs text-gold">
          <ExpeditionIcon name="edge" size={12} className="mt-0.5" />
          {edge.line}
        </li>
      ))}
    </ul>
  );
}

export default function ForkPrompt({
  run,
  fork,
  copies,
  busy,
  rival = null,
  convoy = null,
  onDecide,
  error = null,
}: {
  run: ExpeditionRun;
  fork: ForkView;
  copies: CardCopy[];
  busy: boolean;
  /** The squad's team's next real opponent, when the squad is one roster. */
  rival?: string | null;
  /** The convoy this run rides in, with the partner's answer so far. */
  convoy?: ConvoyView | null;
  onDecide: (choice: ForkChoice) => void;
  /** The refusal from the last answer at THIS fork, if any. */
  error?: string | null;
}) {
  const now = useClock();
  const tier = run.tier as ExpeditionTierKey;
  const def = EXPEDITION_TIERS[tier];
  const road = roadOf(run);
  const story = forksFor(tier, road)[fork.index];
  if (!def || !story) return null;
  const options = forkOptions(tier, fork.index, copies, choiceSheet(run.forks, run.choices), road, run.weather ?? null);
  const { safe, go, more, missing } = splitChoices(options);
  const banter = banterFor(tier, fork.index, copies, run.id, road);
  const left = fork.closesAt.getTime() - now;
  const deadline = `${easternClock(fork.closesAt)} ET`;
  // The mutations the two big choices name ("20% to bring home
  // irradiated"), each a Term: the one word on the fork a newcomer cannot
  // guess.
  const said = [safe, go].map((option) => (option ? (option.baseTease ?? option.tease).toLowerCase() : "")).join(" ");
  const changes = MUTATIONS.filter((mutation) => new RegExp(`\\b${mutation.key}\\b`).test(said));

  return (
    <div data-testid={`fork-${run.id}-${fork.index}`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <Term term="fork" className="label-dash text-gold!">
            <span>
              {def.label} · fork {fork.index + 1} of {run.forks}
            </span>
          </Term>
          <h3 className="type-display mt-0.5 text-2xl">{story.title}</h3>
        </div>
        <p className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-gold">
          <ExpeditionIcon name="clock" />
          {now !== 0 && left <= 0 ? "Deciding…" : `Choose by ${deadline}${now === 0 ? "" : ` · ${untilLabel(left)} left`}`}
        </p>
      </div>

      <p data-story className="max-w-3xl text-sm text-white">
        {rival && hasTrail(run) && tier === RIVAL_FORK.tier && story.key === RIVAL_FORK.key ? (
          <span data-testid="rival-story">{rivalStory(rival)}</span>
        ) : (
          story.story
        )}
        {banter ? <span data-testid="banter" className="text-steel"> {banter}</span> : null}
      </p>

      {convoy ? (
        <p data-testid="convoy-fork" className="flex items-start gap-2 rounded-md border border-gold/40 bg-gold/5 px-3 py-2 text-xs text-white">
          <ExpeditionIcon name="convoy" className="mt-0.5 text-gold" />
          <span>
            <span className="font-bold uppercase tracking-[0.14em] text-gold">Convoy</span>{" "}
            {convoy.partner
              ? (() => {
                  const theirs = convoy.partner.choices.find((entry) => entry.index === fork.index)?.choice ?? null;
                  const verdict = convoyVerdict(null, theirs);
                  return `${convoy.partner.username} ${theirs === null ? "hasn't answered yet" : theirs === "camp" ? "says camp" : theirs === "hold" ? "says hold" : `says push (${theirs})`}. ${
                    verdict === "camping" ? "The convoy camps here whatever you say." : "It pushes only if you both push — a camp on either side camps it."
                  }`;
                })()
              : `Nobody joined with code ${convoy.code} before the first fork — the squad walks alone.`}
          </span>
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {safe ? (
          <div className="flex flex-col gap-1.5">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-mint">
              <ExpeditionIcon name="safe" />
              <Term term="camp">Play it safe</Term>
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide(safe.choice)}
              aria-label={`${safe.label} — ${safe.choice}`}
              className="flex min-h-11 flex-1 flex-col items-start gap-1 rounded-xl border border-mint/60 bg-mint/5 px-4 py-3 text-left text-white transition hover:bg-mint/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ChoiceBody option={safe} locked={false} />
            </button>
            <EdgeLines option={safe} />
          </div>
        ) : null}
        {go ? (
          <div className="flex flex-col gap-1.5">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-coral">
              <ExpeditionIcon name="risk" />
              <Term term="push">Go for it</Term>
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide(go.choice)}
              aria-label={`${go.label} — ${go.choice}`}
              className="btn-coral flex min-h-11 flex-1 flex-col items-start! gap-1 rounded-xl! px-4 py-3 text-left tracking-normal!"
            >
              <ChoiceBody option={go} locked={false} />
            </button>
            <EdgeLines option={go} />
          </div>
        ) : null}
      </div>

      {changes.length > 0 ? (
        <p data-testid="fork-words" className="text-xs text-steel">
          {changes.map((mutation, index) => (
            <span key={mutation.key}>
              {index > 0 ? (index === changes.length - 1 ? " and " : ", ") : null}
              <Term term="mutation" extra={`${mutation.label}: ${mutation.tagline} ${mutation.fantasy} ${mutation.economy}`}>
                {mutation.label}
              </Term>
            </span>
          ))}{" "}
          {changes.length === 1 ? "is a way" : "are ways"} a card can come home changed for good.
        </p>
      ) : null}

      {more.length > 0 ? (
        <details className="group rounded-xl border border-line bg-canvas/40">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold text-white">
            <ExpeditionIcon name="chevron" className="text-steel transition group-open:rotate-90" />
            <span className="whitespace-nowrap">More choices ({more.length})</span>
            <span className="hidden text-xs font-normal text-steel sm:inline">from your roles, signatures and foils</span>
          </summary>
          <div className="flex flex-col gap-3 border-t border-line/60 p-4">
            <p className="text-xs text-steel">
              A <Term term="roleCall">role call</Term> or a print&apos;s option works once a run. Grey ones say what they need.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {more.map((option) => (
                <li key={option.choice} className="flex flex-col gap-1">
                  <button
                    type="button"
                    disabled={busy || option.locked !== null}
                    onClick={() => onDecide(option.choice)}
                    aria-label={`${option.label} — ${option.choice}`}
                    title={option.locked ?? undefined}
                    className={`flex min-h-11 w-full flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed ${
                      option.locked
                        ? "border-line/60 text-steel"
                        : option.choice === "camp" || option.choice === "hold"
                          ? "border-mint/50 text-white hover:bg-mint/10"
                          : option.role
                            ? "border-gold/60 text-white hover:bg-gold/10"
                            : "border-coral/60 text-white hover:bg-coral/10"
                    }`}
                  >
                    <ChoiceBody option={option} locked={option.locked !== null} />
                  </button>
                  <EdgeLines option={option} />
                </li>
              ))}
            </ul>
            {hasRoad(run) && missing.length > 0 ? (
              <p data-testid="role-calls-missing" className="text-xs text-steel">
                Roles unlock a call of their own, once a run: {missing.map((option) => `a ${option.role} could ${option.label.toLowerCase()}`).join(", ")}.
              </p>
            ) : null}
          </div>
        </details>
      ) : null}

      <p className="flex items-start gap-2 text-sm text-steel">
        <ExpeditionIcon name="safe" className="mt-0.5 text-mint" />
        <span>
          If you do nothing by {deadline}, the squad plays it safe.
        </span>
      </p>

      {error ? (
        <p data-testid="expedition-fork-error" role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
