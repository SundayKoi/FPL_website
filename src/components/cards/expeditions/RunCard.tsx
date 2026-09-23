"use client";

// Zone C — one card per squad in the field: where it is, in plain words
// ("Walking · next fork opens 3:10 PM ET"), who went and the edge each one
// carries, the route with the squad on it, and the journal's latest line
// with the rest folded under it. The button that brings a squad home lives
// in Right now, at the top of the page, so there is one of it.
//
// Everything about the ROAD comes from the run's view (views.ts), derived
// on the server: the places the squad knows, the `?` it does not, the
// journal written so far, the edges. The board never holds the road
// itself, so nothing here can name a checkpoint the squad has not reached.
// The one thing a collector can do from this card is spend a map fragment
// to see the rest of the road — the button in the map's corner.

import { useId, useState, useTransition } from "react";
import { EXPEDITION_TIERS, type CardCopy, type ExpeditionTierKey } from "@/lib/expeditions/config";
import { forkViews } from "@/lib/expeditions/forks";
import type { ConvoyView, ExpeditionRun } from "@/lib/expeditions/queries";
import type { PlaceView, RevealOffer, RunView } from "@/lib/expeditions/views";
import { WEATHERS } from "@/lib/expeditions/weather";
import ExpeditionIcon from "../expeditionIcons";
import RouteMap from "../RouteMap";
import { easternClock, untilLabel, useClock } from "./clock";
import { SquadThumb } from "./RightNow";
import Term from "./Term";

const CHIP = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]";

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];

/** "the fourth stop" for an unknown place, "the mirror hall" for a known one. */
function stopName(place: PlaceView): string {
  if (place.known) return place.title.startsWith("The ") ? `the ${place.title.slice(4)}` : place.title;
  return `the ${ORDINALS[place.index] ?? `number ${place.index + 1}`} stop`;
}

/** "a, b and c". */
function listed(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** What the map's marks mean, in words a phone can read without a hover:
 *  how much of the road is still unseen, the dread, and The Warden's
 *  reading of the places nobody has seen. */
function roadNotes(road: PlaceView[]): { unseen: string | null; dread: string | null; warden: string | null } {
  const ahead = road.filter((place) => place.status === "pending" || place.status === "open");
  const unknown = ahead.filter((place) => !place.known);
  const dreaded = ahead.filter((place) => place.warned);
  const dark = unknown.filter((place) => place.dark === true).map(stopName);
  const toll = unknown.filter((place) => place.toll === true).map(stopName);
  const read = [dark.length > 0 ? `${listed(dark)} ${dark.length === 1 ? "is" : "are"} dark` : null, toll.length > 0 ? `${listed(toll)} ${toll.length === 1 ? "charges" : "charge"} a toll` : null].filter(Boolean);
  return {
    unseen: unknown.length > 0 ? `${unknown.length === 1 ? "One checkpoint" : `${unknown.length} checkpoints`} ahead the squad hasn't seen yet.` : null,
    dread: dreaded.length > 0 ? `The squad has a bad feeling about ${listed(dreaded.map(stopName))}.` : null,
    warden: read.length > 0 ? `The Warden's reading: ${read.join("; ")}.` : null,
  };
}

/** See the road ahead: one map fragment shows every checkpoint left. The
 *  view says whether it can be pressed and, when not, why — in words
 *  beside the button, never only in a tooltip. */
function RoadReveal({
  runId,
  offer,
  held,
  onReveal,
}: {
  runId: number;
  offer: RevealOffer;
  held: number;
  onReveal: (runId: number) => Promise<string | null>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const reasonId = useId();
  // Nothing to buy: the squad already knows the rest of the road.
  if (offer.state === "known") return null;
  const cost = `${offer.fragments} map fragment${offer.fragments === 1 ? "" : "s"}`;
  return (
    <div data-testid={`reveal-${runId}`} data-state={offer.state} className="flex w-full flex-col items-start gap-1 sm:w-auto sm:max-w-xs sm:items-end sm:text-right">
      <button
        type="button"
        disabled={!offer.available || pending}
        aria-describedby={offer.available ? undefined : reasonId}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            setError(await onReveal(runId));
          });
        }}
        // Outlined, never the page's primary: this is a spend, and the
        // one filled button above the fold is the thing to do next. On a
        // phone the cost drops to a line of its own rather than breaking
        // mid-word; the name reads "See the road ahead · 1 map fragment".
        className="inline-flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-gold/60 px-4 py-1.5 text-left text-gold transition hover:bg-gold/10 disabled:cursor-not-allowed disabled:border-line disabled:text-steel disabled:hover:bg-transparent sm:w-auto"
      >
        <ExpeditionIcon name="fragment" className="shrink-0" />
        {pending ? (
          <span className="text-sm font-semibold">Reading the map…</span>
        ) : (
          <span className="flex flex-col leading-tight sm:flex-row sm:items-baseline sm:gap-1">
            {/* The spaces sit between the spans: a flex box drops them from
                the layout, and the button's name keeps them. */}
            <span className="text-sm font-semibold">See the road ahead</span>{" "}
            <span className="sr-only sm:not-sr-only sm:text-sm sm:font-semibold">·</span>{" "}
            <span className="text-xs font-medium opacity-80 sm:text-sm sm:font-semibold sm:opacity-100">{cost}</span>
          </span>
        )}
      </button>
      {offer.available ? (
        <p className="text-xs text-steel">
          Shows every checkpoint left on this road. You hold {held} <Term term="fragment">{held === 1 ? "map fragment" : "map fragments"}</Term>.
        </p>
      ) : (
        <p id={reasonId} data-reason className="text-xs text-steel">
          {offer.reason}
        </p>
      )}
      {error ? (
        <p data-testid={`reveal-error-${runId}`} role="alert" className="text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function RunCard({
  run,
  byId,
  convoy = null,
  view = null,
  fragments = 0,
  onReveal,
}: {
  run: ExpeditionRun;
  byId: Map<number, CardCopy>;
  convoy?: ConvoyView | null;
  /** What the server says this squad knows of its road (views.ts). */
  view?: RunView | null;
  /** Map fragments held, for the reveal button's line. */
  fragments?: number;
  /** Spend a fragment on this run's road; resolves to the refusal, or null. */
  onReveal: (runId: number) => Promise<string | null>;
}) {
  const now = useClock();
  const tier = run.tier as ExpeditionTierKey;
  const def = EXPEDITION_TIERS[tier];
  const label = def?.label ?? run.tier;
  // Before the clock is up (the server render), the status reads from the
  // start: no fork is open, and it says only what needs no clock. The
  // road, the journal and the edges are the server's and need none.
  const clock = new Date(now === 0 ? Date.parse(run.startedAt) : now);
  const windows = forkViews(run, clock);
  const due = now !== 0 && Date.parse(run.resolvesAt) <= now;
  const open = windows.find((fork) => fork.status === "open") ?? null;
  const pending = windows.find((fork) => fork.status === "pending") ?? null;
  const start = Date.parse(run.startedAt);
  const end = Date.parse(run.resolvesAt);
  const progress = now === 0 ? null : Math.max(0, Math.min(1, (now - start) / Math.max(1, end - start)));
  const journal = view?.journal ?? [];
  const latest = journal[journal.length - 1] ?? null;
  const road = view?.road ?? [];
  const notes = roadNotes(road);
  const edgeOf = new Map((view?.edges ?? []).map((edge) => [edge.copyId, edge]));
  const stormed = run.encounters.some((entry) => entry.key === "storm");

  const status = now === 0
    ? { icon: "away" as const, tone: "text-steel", text: "On the road" }
    : due
      ? { icon: "home" as const, tone: "text-mint", text: "Home — waiting to be brought in" }
      : open
        ? { icon: "fork" as const, tone: "text-gold", text: `At a fork · choose by ${easternClock(open.closesAt)} ET` }
        : pending
          ? { icon: "away" as const, tone: "text-steel", text: `Walking · next fork opens ${easternClock(pending.opensAt)} ET` }
          : { icon: "away" as const, tone: "text-steel", text: "Walking · no more forks, just the road home" };

  return (
    <li data-testid={`run-${run.id}`} className="card-brand flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="type-display text-xl">{label}</h3>
          <p className={`mt-0.5 flex items-center gap-1.5 text-sm ${status.tone}`}>
            <ExpeditionIcon name={status.icon} />
            {status.text}
          </p>
        </div>
        {due ? (
          <a href="#right-now" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-mint underline-offset-4 hover:underline">
            Bring them home ↑
          </a>
        ) : (
          <p className="flex min-h-11 items-center text-sm font-semibold text-white">
            {now === 0 ? `Back ${easternClock(run.resolvesAt)} ET` : `Back in ${untilLabel(end - now)}`}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="flex gap-2">
          {run.squad.map((id) => {
            const copy = byId.get(id);
            const edge = edgeOf.get(id);
            return (
              <SquadThumb key={id} id={id} copy={copy}>
                {edge ? (
                  <span data-edge-title className="flex w-full items-center justify-center gap-0.5 truncate text-[10px] text-gold/90" title={edge.does}>
                    <ExpeditionIcon name="edge" size={10} />
                    <span className="truncate">{edge.title}</span>
                  </span>
                ) : null}
              </SquadThumb>
            );
          })}
        </div>
        {/* The map, with what its marks mean under it and the reveal in
            its corner: at a phone's width the button drops under the map,
            full width; wider, it sits at the map's bottom-right. */}
        <div data-testid={`road-${run.id}`} className="flex min-w-0 flex-1 basis-64 flex-wrap items-end justify-between gap-x-4 gap-y-2 rounded-lg border border-line/60 bg-canvas/40 px-3 py-2">
          <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
            <RouteMap tier={tier} road={road} progress={progress} />
            {notes.unseen || notes.dread || notes.warden ? (
              <div className="flex flex-col gap-0.5 text-xs">
                {notes.unseen ? (
                  <p data-testid={`unseen-${run.id}`} className="flex items-start gap-1.5 text-steel">
                    <span aria-hidden className="grid h-4 w-4 shrink-0 place-content-center rounded-full border border-dashed border-steel text-[9px] font-bold leading-none">
                      ?
                    </span>
                    {notes.unseen}
                  </p>
                ) : null}
                {notes.dread ? (
                  <p data-testid={`dread-${run.id}`} className="flex items-start gap-1.5 text-coral">
                    <ExpeditionIcon name="risk" size={14} className="mt-px shrink-0" />
                    {notes.dread}
                  </p>
                ) : null}
                {notes.warden ? (
                  <p data-testid={`warden-${run.id}`} className="flex items-start gap-1.5 text-steel">
                    <ExpeditionIcon name="edge" size={14} className="mt-px shrink-0 text-gold" />
                    {notes.warden}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          {view?.reveal ? <RoadReveal runId={run.id} offer={view.reveal} held={fragments} onReveal={onReveal} /> : null}
        </div>
      </div>

      {run.insured || stormed || (run.weather && run.weather !== "clear") || convoy ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {run.insured ? (
            <span className={`${CHIP} border-mint/40 text-mint`}>
              <ExpeditionIcon name="safe" size={11} />
              insured
            </span>
          ) : null}
          {stormed ? <span className={`${CHIP} border-line text-steel`}>a storm held them</span> : null}
          {run.weather && run.weather !== "clear" ? (
            <span data-testid={`weather-${run.id}`} className={`${CHIP} border-line text-steel`}>
              <span aria-hidden>{WEATHERS[run.weather].glyph}</span> under {WEATHERS[run.weather].label.toLowerCase()}
            </span>
          ) : null}
          {convoy ? (
            <span data-testid={`convoy-${run.id}`} className={`${CHIP} border-gold/50 text-gold`}>
              <ExpeditionIcon name="convoy" size={11} />
              {convoy.partner ? `Convoy with ${convoy.partner.username}` : `Convoy code ${convoy.code} — waiting for a partner`}
            </span>
          ) : null}
        </div>
      ) : null}

      {latest ? (
        <div data-testid={`journal-${run.id}`} className="flex flex-col gap-1 border-t border-line/60 pt-3">
          <p className={`text-sm ${latest.kind === "encounter" ? "text-gold" : "text-white"}`}>
            <span className="mr-2 font-mono text-[11px] text-steel">{easternClock(latest.at)}</span>
            {latest.text}
          </p>
          {journal.length > 1 ? (
            <details className="group">
              <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-steel hover:text-white">
                <ExpeditionIcon name="chevron" size={12} className="transition group-open:rotate-90" />
                Read the journal ({journal.length})
              </summary>
              <ol className="flex flex-col gap-1 pb-1">
                {journal.map((entry, index) => (
                  <li
                    key={`${entry.at}-${index}`}
                    className={`text-xs ${entry.kind === "encounter" ? "text-gold" : entry.kind === "arrive" || entry.kind === "home" ? "text-white" : "text-steel"}`}
                  >
                    <span className="mr-1.5 font-mono text-[10px] text-steel/70">{easternClock(entry.at)}</span>
                    {entry.text}
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="border-t border-line/60 pt-3 text-sm text-steel">The squad has just set out. The first word comes back in a few hours.</p>
      )}
    </li>
  );
}
