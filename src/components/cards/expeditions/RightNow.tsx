"use client";

// Zone A — Right now. One card per thing that needs the collector, most
// urgent first: a fork with its deadline, a squad home waiting to be
// brought in, a lost card with days left. The first card carries the
// page's one primary button; the rest are there to be seen, not shouted.
// When nothing needs them, one line says so and says what is next.

import { useState, type ReactNode } from "react";
import { fmtPoints } from "@/lib/betting/format";
import { championCenteredUrl } from "@/lib/match-draft/champions";
import { EXPEDITION_TIERS, ransomFor, type CardCopy, type ExpeditionTierKey } from "@/lib/expeditions/config";
import { forkViews, type ForkChoice, type ForkView } from "@/lib/expeditions/forks";
import type { ConvoyView, ExpeditionRun, LostHold } from "@/lib/expeditions/queries";
import type { OpenForkView, RunView } from "@/lib/expeditions/views";
import ExpeditionIcon from "../expeditionIcons";
import { easternClock, untilLabel, useClock } from "./clock";
import ForkPrompt from "./ForkPrompt";
import Term from "./Term";

/** The art a copy printed in. Three kinds of copy can march, and only
 *  ONE of them carries a `signature`: a player card names its champion
 *  there, a champions relic on champWin, a moment on moment. */
export function copyArtUrl(copy: CardCopy): string | null {
  const champion = copy.card?.signature?.champion ?? copy.card?.champWin?.champion ?? copy.card?.moment?.champion ?? null;
  return champion ? championCenteredUrl(champion, copy.card?.artSkin ?? 0) : null;
}

/** A secondary action in this zone: outlined, so the one filled button on
 *  the page is the primary one. */
export const SECONDARY = "rounded-full border border-line px-5 text-sm font-semibold text-white transition hover:border-steel";

/** Hide art that failed to load, leaving the empty frame behind it. Run
 *  both as the error handler and when the node mounts: an image that
 *  failed before hydration never reaches React's onError. */
function hideIfBroken(node: HTMLImageElement | null) {
  if (node && node.complete && node.naturalWidth === 0 && node.getAttribute("src")) node.style.visibility = "hidden";
}

/** One card in a squad strip — small, because the decision has already
 *  been made and this is a reminder of who is away. */
export function SquadThumb({ copy, id, children }: { copy: CardCopy | undefined; id: number; children?: ReactNode }) {
  const art = copy ? copyArtUrl(copy) : null;
  return (
    <span className="flex w-16 shrink-0 flex-col items-center gap-1">
      <span aria-hidden className="relative grid h-10 w-16 place-content-center rounded-sm border border-line bg-navy/60 text-[10px] text-steel">
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={hideIfBroken}
            src={art}
            alt=""
            loading="lazy"
            onError={(event) => hideIfBroken(event.currentTarget)}
            className="absolute inset-0 h-full w-full rounded-sm object-cover object-[center_20%]"
          />
        ) : (
          "?"
        )}
      </span>
      <span className="w-full truncate text-center text-[11px] text-white" title={copy?.playerName}>
        {copy?.playerName ?? `#${id}`}
      </span>
      {children}
    </span>
  );
}

/** "the reactor" in a sentence, from a place titled "The reactor". */
function inSentence(title: string): string {
  return title.startsWith("The ") ? `the ${title.slice(4)}` : title;
}

export interface OpenForkItem {
  run: ExpeditionRun;
  fork: ForkView;
}

/** A lost card and the two ways home. */
function MissingCard({
  hold,
  copy,
  busy,
  primary,
  onRescue,
  onRansom,
}: {
  hold: LostHold;
  copy: CardCopy | undefined;
  busy: boolean;
  primary: boolean;
  onRescue: () => void;
  onRansom: () => void;
}) {
  const now = useClock();
  const [armed, setArmed] = useState(false);
  const left = new Date(hold.expiresAt).getTime() - now;
  const price = copy ? ransomFor(copy) : null;
  const name = copy?.playerName ?? `#${hold.cardId}`;
  return (
    <li data-testid={`hold-${hold.holdId}`} className="card-brand flex flex-wrap items-center gap-x-5 gap-y-3 border-coral/50 p-4">
      <SquadThumb copy={copy} id={hold.cardId} />
      <div className="min-w-0 flex-1 basis-56">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-coral">
          <ExpeditionIcon name="lost" />
          Lost on the road
        </p>
        <p className="mt-1 text-base font-semibold text-white">
          {now !== 0 && left <= 0
            ? `${name} is being buried…`
            : `${name} is lost. Bring them back by ${easternClock(hold.expiresAt)} ET${now === 0 ? "" : ` (${untilLabel(left)} left)`}.`}
        </p>
        <p className="text-xs text-steel">Send a Rescue after them, or pay the ransom. Either way they come home wounded.</p>
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <button type="button" onClick={onRescue} disabled={busy} className={`${primary ? "btn-coral px-5 text-sm" : SECONDARY} min-h-11 disabled:opacity-50`}>
          Send a rescue
        </button>
        <button
          type="button"
          onClick={() => {
            if (!armed) {
              setArmed(true);
              return;
            }
            setArmed(false);
            onRansom();
          }}
          onBlur={() => setArmed(false)}
          disabled={busy || price === null}
          aria-label={armed ? `Confirm — pay ${price ?? 0} to ransom ${copy?.playerName ?? "the card"}` : `Ransom for ${price ?? 0}`}
          className={`${SECONDARY} min-h-11 disabled:cursor-not-allowed disabled:opacity-50 ${armed ? "border-coral! bg-coral/15 text-coral!" : ""}`}
        >
          {armed ? `Confirm — pay ${fmtPoints(price ?? 0)}` : `Pay ${fmtPoints(price ?? 0)} ransom`}
        </button>
      </div>
    </li>
  );
}

/** A squad back from the road, and the button that brings it in. */
function HomeCard({
  run,
  byId,
  primary,
  busy,
  claiming,
  onClaim,
}: {
  run: ExpeditionRun;
  byId: Map<number, CardCopy>;
  primary: boolean;
  busy: boolean;
  claiming: boolean;
  onClaim: () => void;
}) {
  const label = EXPEDITION_TIERS[run.tier as ExpeditionTierKey]?.label ?? run.tier;
  return (
    <li data-testid={`now-${run.id}`} className="card-brand flex flex-wrap items-center gap-x-5 gap-y-3 border-mint/50 p-4">
      <div className="min-w-0 flex-1 basis-56">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-mint">
          <ExpeditionIcon name="home" />
          Home
        </p>
        <p className="mt-1 text-base font-semibold text-white">{label.startsWith("The ") ? label : `The ${label}`} is home.</p>
        <p className="text-xs text-steel">
          {run.squad.map((id) => byId.get(id)?.playerName ?? `#${id}`).join(", ")} — see what they found and who came back changed.
        </p>
      </div>
      <button
        type="button"
        onClick={onClaim}
        disabled={busy}
        aria-label={`Claim the ${label}`}
        className={`${primary ? "btn-coral px-5 text-sm" : SECONDARY} min-h-11 w-full disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto`}
      >
        {claiming ? "Bringing them home…" : "Bring them home"}
      </button>
    </li>
  );
}

/** A second fork, folded to one line until it is opened. */
function ForkCard({
  item,
  view,
  primary,
  busy,
  convoy,
  error,
  onDecide,
}: {
  item: OpenForkItem;
  /** The server's word on this run's open fork, or null before it has one. */
  view: OpenForkView | null;
  primary: boolean;
  busy: boolean;
  convoy: ConvoyView | null;
  error: string | null;
  onDecide: (choice: ForkChoice) => void;
}) {
  const [open, setOpen] = useState(primary);
  const { run, fork } = item;
  const tier = run.tier as ExpeditionTierKey;
  const label = EXPEDITION_TIERS[tier]?.label ?? run.tier;
  // The place's name is the server's to give; a view from before the fork
  // opened has none yet, and the fork is named by its number.
  const place = view && view.index === fork.index ? view.title : null;
  return (
    <li data-testid={`now-${run.id}`} className="card-brand border-gold/60 p-4 sm:p-5">
      {open ? (
        <ForkPrompt run={run} fork={fork} open={view} busy={busy} convoy={convoy} error={error} onDecide={onDecide} />
      ) : (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="min-w-0 flex-1 basis-56">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-gold">
              <ExpeditionIcon name="fork" />
              A fork
            </p>
            <p className="mt-1 text-base font-semibold text-white">
              Your {label.replace(/^The /, "")} is at {place ? inSentence(place) : `fork ${fork.index + 1}`} — choose by {easternClock(fork.closesAt)} ET.
            </p>
          </div>
          <button type="button" onClick={() => setOpen(true)} className={`${SECONDARY} min-h-11 w-full sm:w-auto`}>
            Choose
          </button>
        </div>
      )}
    </li>
  );
}

/** What is due on the road next, for the "nothing needs you" line. */
function nextOnTheRoad(active: ExpeditionRun[], now: Date): { named: string; kind: "fork" | "home"; at: Date } | null {
  let next: { named: string; kind: "fork" | "home"; at: Date } | null = null;
  for (const run of active) {
    const label = EXPEDITION_TIERS[run.tier as ExpeditionTierKey]?.label ?? run.tier;
    const named = label.startsWith("The ") ? label : `the ${label}`;
    const pending = forkViews(run, now).find((fork) => fork.status === "pending");
    const candidates = [
      pending ? { named, kind: "fork" as const, at: pending.opensAt } : null,
      { named, kind: "home" as const, at: new Date(run.resolvesAt) },
    ];
    for (const candidate of candidates) {
      if (candidate && candidate.at.getTime() > now.getTime() && (!next || candidate.at < next.at)) next = candidate;
    }
  }
  return next;
}

export default function RightNow({
  active,
  holds,
  byId,
  busy,
  busyRun,
  views,
  convoys,
  forkError,
  claimError,
  holdError,
  onDecide,
  onClaim,
  onRescue,
  onRansom,
}: {
  /** The runs in the field, unclaimed. */
  active: ExpeditionRun[];
  holds: LostHold[];
  byId: Map<number, CardCopy>;
  busy: boolean;
  busyRun: number | null;
  /** What the server says each run's squad knows (views.ts), by run id. */
  views: Record<number, RunView>;
  convoys: Record<number, ConvoyView>;
  forkError: { runId: number; error: string } | null;
  claimError: string | null;
  holdError: string | null;
  onDecide: (run: ExpeditionRun, index: number, choice: ForkChoice) => void;
  onClaim: (run: ExpeditionRun) => void;
  onRescue: (hold: LostHold) => void;
  onRansom: (hold: LostHold) => void;
}) {
  // Its own clock, so a fork opening or a squad coming home while the page
  // is open moves into this zone without repainting the whole board.
  const clock = useClock();
  const now = clock === 0 ? new Date() : new Date(clock);
  const forks: OpenForkItem[] = active
    .flatMap((run) => forkViews(run, now).filter((fork) => fork.status === "open").map((fork) => ({ run, fork })))
    .sort((a, b) => a.fork.closesAt.getTime() - b.fork.closesAt.getTime());
  const home = active.filter((run) => Date.parse(run.resolvesAt) <= now.getTime());
  const byDeadline = [...holds].sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
  const next = nextOnTheRoad(active, now);
  const anyInField = active.length > 0;
  const count = forks.length + home.length + byDeadline.length;

  return (
    <section id="right-now" aria-label="Right now" data-testid="right-now" className="flex flex-col gap-3">
      <h2 className="label-dash">Right now</h2>
      {count === 0 ? (
        <p data-testid="now-none" className="card-brand flex items-start gap-3 p-4 text-sm text-white">
          <ExpeditionIcon name="check" className="mt-0.5 text-mint" size={16} />
          <span>
            <b className="font-semibold">Nothing needs you.</b>{" "}
            <span className="text-steel">
              {next ? (
                <>
                  Next: {next.named} {next.kind === "fork" ? (
                    <>
                      reaches a <Term term="fork">fork</Term>
                    </>
                  ) : (
                    "is home"
                  )}{" "}
                  at {easternClock(next.at)} ET.
                </>
              ) : anyInField
                  ? "The squads out there have nothing more to ask."
                  : "No squad is out — pick three cards below to send one."}
            </span>
          </span>
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {forks.map((item, index) => (
            <ForkCard
              key={`${item.run.id}-${item.fork.index}`}
              item={item}
              view={views[item.run.id]?.openFork ?? null}
              primary={index === 0}
              busy={busy && busyRun === item.run.id}
              convoy={convoys[item.run.id] ?? null}
              error={forkError && forkError.runId === item.run.id ? forkError.error : null}
              onDecide={(choice) => onDecide(item.run, item.fork.index, choice)}
            />
          ))}
          {home.map((run, index) => (
            <HomeCard
              key={run.id}
              run={run}
              byId={byId}
              primary={forks.length === 0 && index === 0}
              busy={busy}
              claiming={busyRun === run.id}
              onClaim={() => onClaim(run)}
            />
          ))}
          {byDeadline.map((hold, index) => (
            <MissingCard
              key={hold.holdId}
              hold={hold}
              copy={byId.get(hold.cardId)}
              busy={busy}
              primary={forks.length === 0 && home.length === 0 && index === 0}
              onRescue={() => onRescue(hold)}
              onRansom={() => onRansom(hold)}
            />
          ))}
        </ul>
      )}
      {claimError ? (
        <p data-testid="expedition-claim-error" role="alert" className="text-sm text-red-400">
          {claimError}
        </p>
      ) : null}
      {holdError ? (
        <p data-testid="expedition-hold-error" role="alert" className="text-sm text-red-400">
          {holdError}
        </p>
      ) : null}
    </section>
  );
}
