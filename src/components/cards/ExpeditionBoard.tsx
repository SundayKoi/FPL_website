"use client";

// The expedition board: pick three cards, read what each run asks for, send
// the squad, and — hours later — find out what they brought back.
//
// One component and one state machine rather than a route per phase. An
// expedition has four states from the player's side (nothing picked, a
// squad assembled, a squad away, a squad home) and every one of them is a
// view of the same two lists — your copies and your runs — so splitting
// them across routes would mean re-fetching the collection to say the same
// thing three more times. The ceremony in particular has to be a state and
// not a page: what a run brought back exists for exactly one render, and a
// URL you can go back to is a URL that shows the payout twice.
//
// Nothing here is authoritative. `squadMeets` disables a launch button, and
// `deployedIds` greys a chip, but launch_expedition re-checks every gate
// under a row lock and card_inventory_expedition_guard refuses to let a
// deployed copy move at all — the same "preview of a verdict" split
// TradeBuilder keeps. Which is why a refused launch renders its error
// inline rather than being pre-empted.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import CountUp from "@/components/home/CountUp";
import { fmtPoints } from "@/lib/betting/format";
import { championCenteredUrl } from "@/lib/match-draft/champions";
import { easternDateOf } from "@/lib/packs/week";
import {
  EXPEDITION_TIERS,
  MARK_RANK,
  SQUAD_SIZE,
  briefFor,
  shineOf,
  squadMeets,
  squadShine,
  type CardCopy,
  type ExpeditionMark as ExpeditionMarkKind,
  type ExpeditionOutcome,
  type ExpeditionTierDef,
  payoutRange,
  BRIEF_BONUS,
  SHINE_BONUS_CAP,
  type ExpeditionTierKey,
  type OutcomeGrade,
} from "@/lib/expeditions/config";
import { claimExpeditionAction, launchExpeditionAction } from "@/lib/expeditions/actions";
import type { ExpeditionRun } from "@/lib/expeditions/queries";
import PlayerCard3D from "./PlayerCard3D";
import { tierLabel } from "./CardCopyPreview";

/** The tiers in ladder order — Record iteration order is insertion order
 *  here, but the board's spine should not depend on that. */
const TIER_ORDER: ExpeditionTierKey[] = ["scout", "raid", "legend"];

/** What each run is FOR, in one line. The requirements say what it costs;
 *  this says why anyone would pay it. */
const TIER_FLAVOR: Record<ExpeditionTierKey, string> = {
  scout: "A short walk for pocket money. No gate, no comps, and back before the evening.",
  raid: "A day out. Pays properly, and a good one can come home with a free pack and a Sigil.",
  legend:
    "Two days, and only a real collection can field it. The best money on the board, and every jackpot marks a card forever.",
};

/** How a claim reads before you get to the numbers. */
const GRADE_HEADLINE: Record<OutcomeGrade, string> = {
  poor: "They made it back",
  solid: "A good run",
  jackpot: "They struck gold",
};

/** "12 shine · 1 foil" — the gates a tier actually applies, and nothing
 *  else. A tier with no gates says so rather than rendering a blank. */
function requirementLine(def: ExpeditionTierDef): string {
  const parts: string[] = [];
  if (def.minShine > 0) parts.push(`${def.minShine} shine`);
  if (def.minFoils > 0) parts.push(`${def.minFoils} foil${def.minFoils === 1 ? "" : "s"}`);
  if (def.minSigned > 0) parts.push(`${def.minSigned} signed`);
  return parts.length === 0 ? "Anyone can run it" : parts.join(" · ");
}

/**
 * "1h 29m" / "4m 12s" / "" once it is due.
 *
 * Minute granularity above the hour on purpose: a seconds counter on a
 * 48-hour run is a spinning odometer nobody reads, and it would repaint the
 * whole board once a second for two days.
 */
function untilLabel(msLeft: number): string {
  if (msLeft <= 0) return "";
  const seconds = Math.floor(msLeft / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return "seconds";
}

/**
 * The wall clock, as an external store rather than a `setInterval` writing
 * `useState`.
 *
 * Two reasons it has to be this shape. It is genuinely EXTERNAL state — the
 * time is not React's to own — and `useSyncExternalStore` is the hook for
 * that; setting state from an effect body to seed it is the cascading
 * render the lint rule (and React's own guidance) is about. And it is the
 * only clock that hydrates safely: `getServerSnapshot` hands the server
 * render a 0, so the HTML says "back at 4:15 PM ET" — a fact needing no
 * clock — and only the hydrated browser swaps in a live countdown. A
 * `Date.now()` baked into server HTML disagrees with the browser's a
 * moment later, which is a hydration mismatch on every run on the board.
 *
 * `readClock` caches to the second because getSnapshot MUST return a
 * stable value between reads or React re-renders forever.
 */
const CLOCK_TICK_MS = 1000;
let clockCache = 0;

function subscribeClock(onChange: () => void): () => void {
  const timer = setInterval(() => {
    clockCache = Date.now();
    onChange();
  }, CLOCK_TICK_MS);
  return () => clearInterval(timer);
}

function readClock(): number {
  const now = Date.now();
  if (now - clockCache >= CLOCK_TICK_MS) clockCache = now;
  return clockCache;
}

/** No clock on the server — 0 reads as "not mounted yet". */
function readServerClock(): number {
  return 0;
}

/**
 * Where one run is up to: a live countdown, or the button that ends it.
 *
 * Its own component because it is the only thing on the board that repaints
 * every second, and a clock in the parent would repaint the whole squad
 * picker with it — several hundred chips on a real collection.
 */
function RunStatus({
  run,
  label,
  busy,
  claiming,
  onClaim,
}: {
  run: ExpeditionRun;
  label: string;
  busy: boolean;
  claiming: boolean;
  onClaim: () => void;
}) {
  const now = useSyncExternalStore(subscribeClock, readClock, readServerClock);
  const due = new Date(run.resolvesAt).getTime();

  if (now === 0) {
    // Server render and the first hydrating paint: the absolute time, which
    // is true without knowing what time it is now.
    return (
      <span className="text-sm text-muted">
        Back at{" "}
        {new Date(run.resolvesAt).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/New_York",
        })}{" "}
        ET
      </span>
    );
  }

  if (due <= now) {
    return (
      <button
        type="button"
        onClick={onClaim}
        disabled={busy}
        aria-label={`Claim the ${label}`}
        className="btn-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        {claiming ? "Bringing them home…" : "Bring them home"}
      </button>
    );
  }

  return <span className="text-sm font-semibold text-white">Back in {untilLabel(due - now)}</span>;
}

/** The art this copy printed in, same chain DustControls' row thumbnail
 *  takes — and the same refusal to fall back to base art, which would show
 *  the wrong skin for a card the player is about to commit for two days.
 *
 *  Three kinds of copy can march, and only ONE of them carries a
 *  `signature`: a player card names its champion there, a champions relic
 *  names it on champWin, a moment on moment. Reading only the first left
 *  every relic and moment in a squad rendering as a "?" box. */
function copyArtUrl(copy: CardCopy): string | null {
  const champion =
    copy.card?.signature?.champion ?? copy.card?.champWin?.champion ?? copy.card?.moment?.champion ?? null;
  return champion ? championCenteredUrl(champion, copy.card?.artSkin ?? 0) : null;
}

/** One card in a run's squad strip — small, because the decision has
 *  already been made and this is a reminder of who is away. */
function SquadThumb({ copy, id }: { copy: CardCopy | undefined; id: number }) {
  const art = copy ? copyArtUrl(copy) : null;
  return (
    <span className="flex w-14 shrink-0 flex-col items-center gap-1">
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={art}
          alt=""
          aria-hidden
          loading="lazy"
          className="h-9 w-14 rounded-sm border border-border object-cover object-[center_20%]"
        />
      ) : (
        <span aria-hidden className="grid h-9 w-14 place-content-center rounded-sm border border-border bg-canvas/60 text-[10px] text-muted">
          ?
        </span>
      )}
      <span className="w-full truncate text-center text-[10px] text-muted" title={copy?.playerName}>
        {/* A copy the collection read didn't return — traded away mid-run is
            impossible (the guard refuses), so this is only ever a squad from
            another season's shelf being viewed from this one. */}
        {copy?.playerName ?? `#${id}`}
      </span>
    </span>
  );
}

interface Ceremony {
  /** The run that just came home — the ceremony needs its LAUNCH day to
   *  name the brief the payout was scored against, which is not
   *  necessarily today's (a Legend Hunt is out for two of them). */
  run: ExpeditionRun;
  outcome: ExpeditionOutcome;
  bearerId: number | null;
  balance: number;
}

export default function ExpeditionBoard({
  copies,
  runs,
  deployedIds,
  today,
}: {
  /** The viewer's shelf for the season being browsed. */
  copies: CardCopy[];
  /** Their runs this season, newest launch first — away and finished both. */
  runs: ExpeditionRun[];
  /** Every copy of theirs currently away, in ANY season (the lock is a
   *  property of the card). Presentation only; the trigger is the rule. */
  deployedIds: ReadonlySet<number>;
  /** Today's Eastern date, resolved on the server — the same calendar
   *  claim_expedition scores a run's brief against, so the banner can't
   *  disagree with the payout. */
  today: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  // Two error slots, not one: a refused launch belongs under the tier cards
  // the player just clicked, and a refused claim belongs beside the run it
  // refused. One shared slot puts half of them off the bottom of the fold.
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [ceremony, setCeremony] = useState<Ceremony | null>(null);
  // Runs claimed in THIS session. router.refresh() re-reads the server, but
  // the ceremony is open over the top of the board until dismissed and the
  // run must not still be sitting in the field behind it.
  const [claimed, setClaimed] = useState<ReadonlySet<number>>(new Set());
  const [busyTier, setBusyTier] = useState<ExpeditionTierKey | null>(null);
  const [busyRun, setBusyRun] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const brief = briefFor(today);
  const byId = useMemo(() => new Map(copies.map((copy) => [copy.id, copy])), [copies]);
  // Best card first, then by name: the shelf order a collector scans in,
  // and the top of it is where a squad gets picked from.
  const sorted = useMemo(
    () => [...copies].sort((a, b) => shineOf(b) - shineOf(a) || a.playerName.localeCompare(b.playerName)),
    [copies],
  );
  const squad = useMemo(() => copies.filter((copy) => picked.has(copy.id)), [copies, picked]);
  const shine = squadShine(squad);
  const full = picked.size >= SQUAD_SIZE;

  const active = runs.filter((run) => run.claimedAt === null && !claimed.has(run.id));
  // One of each tier at a time — launch_expedition enforces it, this only
  // says so before the click. A tier whose run is still in the field can't
  // be sent again until it is claimed.
  const tiersOut = new Set(active.map((run) => run.tier));
  const finished = runs.filter((run) => run.claimedAt !== null || claimed.has(run.id));

  function toggle(id: number) {
    setLaunchError(null);
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id) && next.size < SQUAD_SIZE) next.add(id);
      return next;
    });
  }

  function launch(tier: ExpeditionTierKey) {
    setLaunchError(null);
    setBusyTier(tier);
    // Taken from `squad` (a filter over `copies`) rather than from the
    // `picked` Set: a Set iterates in insertion order, which here is CLICK
    // order, and the run row would then record a squad in an order nothing
    // else on the site uses. The RPC doesn't care; the field strip does.
    const squadIds = squad.map((copy) => copy.id);
    startTransition(async () => {
      const result = await launchExpeditionAction(tier, squadIds);
      setBusyTier(null);
      if (!result.ok) {
        setLaunchError(result.error);
        return;
      }
      setPicked(new Set());
      router.refresh();
    });
  }

  function claim(run: ExpeditionRun) {
    setClaimError(null);
    setBusyRun(run.id);
    startTransition(async () => {
      const result = await claimExpeditionAction(run.id);
      setBusyRun(null);
      if (!result.ok) {
        setClaimError(result.error);
        // Refresh on the failure too. The common refusal is 'already
        // claimed' — the claim went through and the response was dropped,
        // so the run is resolved on the server while the board still shows
        // a live Claim button over it. Re-reading moves it into the field
        // log with its payout; the message stays up to say what happened.
        router.refresh();
        return;
      }
      setCeremony({ run, outcome: result.outcome, bearerId: result.bearerId, balance: result.balance });
      setClaimed((current) => new Set(current).add(run.id));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8" data-testid="expedition-board">
      {/* ── Today's brief ─────────────────────────────────────────────── */}
      <section
        data-testid="expedition-brief"
        className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-gold/50 bg-gold/10 px-4 py-3"
      >
        <span className="text-sm font-bold uppercase tracking-[0.14em] text-gold">Today&apos;s brief</span>
        <span className="text-sm font-semibold text-white">{brief.label} — +20% yield</span>
        <span className="text-xs text-muted">
          Send a {brief.role} with the squad and whatever they find pays 20% more. The brief is scored
          against the day you LAUNCH, so a run keeps the bonus it left with.
        </span>
      </section>

      {/* ── Squads in the field ───────────────────────────────────────── */}
      {active.length > 0 ? (
        <section aria-label="Expeditions in the field" className="flex flex-col gap-3">
          <h2 className="type-display text-2xl sm:text-3xl">In the field</h2>
          <ul className="flex flex-col gap-2">
            {active.map((run) => {
              const def = EXPEDITION_TIERS[run.tier];
              return (
                <li
                  key={run.id}
                  data-testid={`run-${run.id}`}
                  className="card-brand flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3"
                >
                  <div className="min-w-[9rem]">
                    <span className="label-dash">{run.shine} shine</span>
                    <p className="type-display mt-0.5 text-lg">{def?.label ?? run.tier}</p>
                  </div>
                  <div className="flex gap-2">
                    {run.squad.map((id) => (
                      <SquadThumb key={id} id={id} copy={byId.get(id)} />
                    ))}
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    <RunStatus
                      run={run}
                      label={def?.label ?? run.tier}
                      busy={pending}
                      claiming={busyRun === run.id}
                      onClaim={() => claim(run)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          {claimError ? (
            <p data-testid="expedition-claim-error" className="text-sm text-red-400">
              {claimError}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── The three runs ────────────────────────────────────────────── */}
      <section aria-label="Expedition tiers" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="type-display text-2xl sm:text-3xl">Choose a run</h2>
          <span className="text-xs text-muted">
            Every run takes {SQUAD_SIZE} cards. They come back when the clock runs out — nothing is spent.
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {TIER_ORDER.map((key) => {
            const def = EXPEDITION_TIERS[key];
            const gate = squadMeets(key, squad);
            const isOut = tiersOut.has(key);
            return (
              <article
                key={key}
                data-testid={`tier-${key}`}
                className={`card-brand flex flex-col gap-3 p-5 transition ${
                  gate.ok && !isOut ? "border-mint/50" : ""
                }`}
              >
                <div>
                  <h3 className="type-display text-xl">{def.label}</h3>
                  <p className="mt-0.5 text-xs uppercase tracking-wide text-muted">{def.durationHours} hours away</p>
                </div>
                <p className="text-sm text-muted">{TIER_FLAVOR[key]}</p>
                <p className="text-sm font-semibold text-white">
                  <span className="label-dash mr-2 inline-block">Entry</span>
                  <span>{requirementLine(def)}</span>
                </p>
                {/* What it pays, before shine and the brief. Printed because
                    a two-day wait is a bet, and nobody should have to make
                    it blind. */}
                <p className="text-sm font-semibold text-white">
                  <span className="label-dash mr-2 inline-block">Pays</span>
                  <span className="font-mono text-mint">
                    {fmtPoints(payoutRange(key).min)}–{fmtPoints(payoutRange(key).max)}
                  </span>
                  <span className="ml-2 text-xs font-normal text-muted">
                    +{Math.round(SHINE_BONUS_CAP * 100)}% at most from shine, +{Math.round(BRIEF_BONUS * 100)}% for the brief
                  </span>
                </p>
                {isOut ? (
                  <p data-testid={`tier-${key}-out`} className="text-xs text-gold">
                    Already in the field. One {def.label} at a time — bring this one home first.
                  </p>
                ) : gate.ok ? null : (
                  <ul className="flex flex-col gap-1">
                    {gate.reasons.map((reason) => (
                      <li key={reason} className="text-xs text-coral">
                        {reason}
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => launch(key)}
                  disabled={!gate.ok || isOut || pending}
                  aria-label={`Launch ${def.label}`}
                  className="btn-primary mt-auto px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyTier === key ? "Sending…" : isOut ? "Still out there" : "Send them out"}
                </button>
              </article>
            );
          })}
        </div>
        {launchError ? (
          <p data-testid="expedition-error" className="text-sm text-red-400">
            {launchError}
          </p>
        ) : null}
      </section>

      {/* ── The squad picker ──────────────────────────────────────────── */}
      <section aria-label="Your squad" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="type-display text-2xl sm:text-3xl">Pick your squad</h2>
          <span data-testid="squad-shine" className="text-sm text-muted">
            <b className="font-semibold text-white">
              {picked.size}/{SQUAD_SIZE}
            </b>{" "}
            picked · <b className="font-semibold text-mint">{shine}</b> shine
          </span>
          {picked.size > 0 ? (
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              className="text-xs text-muted underline-offset-4 hover:text-primary hover:underline"
            >
              Clear
            </button>
          ) : null}
        </div>
        {copies.length === 0 ? (
          <p className="text-sm text-muted">No cards to send yet — open a pack.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {sorted.map((copy) => {
              const deployed = deployedIds.has(copy.id);
              const selected = picked.has(copy.id);
              const worth = shineOf(copy);
              return (
                <li key={copy.id}>
                  <button
                    type="button"
                    onClick={() => toggle(copy.id)}
                    disabled={deployed || (!selected && full)}
                    aria-pressed={selected}
                    aria-label={`${copy.playerName} — ${worth} shine`}
                    title={deployed ? "On expedition — back soon." : undefined}
                    className={`relative flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition disabled:cursor-not-allowed ${
                      selected
                        ? "border-coral bg-coral/15"
                        : "border-border bg-surface hover:border-primary/60 disabled:opacity-40 disabled:hover:border-border"
                    }`}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-xs font-semibold text-white">{copy.playerName}</span>
                      <span className="text-[10px] uppercase tracking-wide text-muted">
                        {tierLabel(copy.tier)}
                        {copy.role ? ` · ${copy.role}` : ""}
                        {deployed ? " · on expedition" : ""}
                      </span>
                    </span>
                    {copy.signed ? (
                      <span aria-hidden className="text-xs font-black text-gold">
                        ✍
                      </span>
                    ) : null}
                    {copy.foil ? (
                      <span aria-hidden className="text-xs font-black text-gold">
                        ✦
                      </span>
                    ) : null}
                    <span className="rounded-full border border-mint/50 bg-mint/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-mint">
                      +{worth}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── The log ───────────────────────────────────────────────────── */}
      {finished.length > 0 ? (
        <section aria-label="Finished expeditions" className="flex flex-col gap-3">
          <h2 className="type-display text-2xl sm:text-3xl">Field log</h2>
          <ul className="flex flex-col gap-1">
            {finished.map((run) => (
              <li
                key={run.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-surface px-3 py-1.5 text-xs"
              >
                <span className="font-semibold text-white">{EXPEDITION_TIERS[run.tier]?.label ?? run.tier}</span>
                <span className="text-muted">
                  {/* Pinned to Eastern for RunStatus' reason: without a
                      timeZone the server formats in UTC and the browser in
                      the viewer's zone, so a run launched between midnight
                      and 4am UTC renders one date in the HTML and another
                      after hydration — a mismatch, and the wrong day. ET is
                      also the calendar the feature runs on end to end (the
                      daily limit, and the brief the payout was scored
                      against), so the log agrees with the payout. */}
                  {new Date(run.startedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    timeZone: "America/New_York",
                  })}
                </span>
                {run.outcome ? (
                  <>
                    <span className="font-mono font-bold text-mint">{fmtPoints(run.outcome.dollars)}</span>
                    {run.outcome.comp ? <span className="text-gold">free pack</span> : null}
                    {run.outcome.mark ? (
                      <span className="text-gold">
                        {run.outcome.mark} mark
                        {run.outcome.bearer !== null && byId.get(run.outcome.bearer)
                          ? ` — ${byId.get(run.outcome.bearer)!.playerName}`
                          : ""}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-muted">claimed</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {ceremony ? (
        <ClaimCeremony ceremony={ceremony} copies={byId} onClose={() => setCeremony(null)} />
      ) : null}
    </div>
  );
}

/**
 * What a run brought home, over the board.
 *
 * The mark shown is the BETTER of what the run rolled and what the bearer
 * already wore — claim_expedition replaces a mark only upward, so a Trail
 * landing on a card that already carries a Legend changes nothing, and
 * drawing the Trail here would be a lie about the card the player is
 * looking at.
 */
function ClaimCeremony({
  ceremony,
  copies,
  onClose,
}: {
  ceremony: Ceremony;
  copies: Map<number, CardCopy>;
  onClose: () => void;
}) {
  const { outcome, bearerId, balance } = ceremony;
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Same overlay manners as CardCopyPreview: focus lands on the way out,
  // Escape takes it, and the backdrop is clickable. A ceremony that can
  // only be dismissed with the mouse is a ceremony a keyboard reader is
  // stuck inside.
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
  const shown: ExpeditionMarkKind | null =
    outcome.mark && (!worn || MARK_RANK[outcome.mark] > MARK_RANK[worn]) ? outcome.mark : worn;

  // The frozen card with the mark it now wears. Synthesized rather than
  // re-read: claim_expedition has already written this to card_inventory,
  // and router.refresh() is in flight — this is the same card arriving a
  // beat earlier so the reveal isn't a blank frame.
  const marked =
    bearer && shown
      ? {
          ...bearer.card,
          expedition: {
            mark: shown,
            tier: bearer.card?.expedition?.tier ?? "",
            date: bearer.card?.expedition?.date ?? new Date().toISOString().slice(0, 10),
          },
        }
      : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Expedition results"
      data-testid="expedition-ceremony"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4"
    >
      <div
        // The sheet swallows its own clicks so reading the card doesn't
        // dismiss the thing you are reading.
        onClick={(event) => event.stopPropagation()}
        className="card-brand my-auto flex max-w-lg flex-col items-center gap-4 p-6 text-center"
      >
        <span className="label-dash">{outcome.grade === "jackpot" ? "Jackpot" : "The squad is home"}</span>
        <h2 className="type-display text-3xl sm:text-4xl">{GRADE_HEADLINE[outcome.grade]}</h2>

        <p className="type-display text-4xl text-mint sm:text-5xl">
          <span aria-hidden>$</span>
          <CountUp value={outcome.dollars} />
          <span className="sr-only"> betting dollars</span>
        </p>
        <p className="text-xs text-muted">Balance {fmtPoints(balance)}</p>

        {outcome.briefHit ? (
          <p className="text-sm text-gold">
            {briefFor(easternDateOf(new Date(ceremony.run.startedAt))).label} — the brief paid +20%.
          </p>
        ) : null}
        {outcome.comp ? (
          <p className="text-sm text-gold">They came back with a free pack — it&apos;s waiting in the shop.</p>
        ) : null}

        {marked && bearer ? (
          <div className="flex flex-col items-center gap-3">
            <p className="type-display text-xl">The expedition chose {bearer.playerName}</p>
            <PlayerCard3D card={marked} interactive forceFoil={bearer.foil} foilType={bearer.foilType} />
            <p className="max-w-sm text-xs text-muted">
              It wears the {shown} mark from here on — on the shelf, in a trade, and on its share page.
            </p>
          </div>
        ) : null}

        <button ref={closeRef} type="button" onClick={onClose} className="btn-pill mt-2">
          Back to the board
        </button>
      </div>
    </div>
  );
}
