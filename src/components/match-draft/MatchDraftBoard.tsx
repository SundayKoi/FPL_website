"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CHAMPIONS, championByName, type ChampionRole } from "@/lib/match-draft/champions";
import { actionForStep, DRAFT_TURN_SECONDS, isChampionUnavailable, LCS_DRAFT_STEPS } from "@/lib/match-draft/rules";
import type { DraftActionKind, DraftSide, MatchDraftAction, MatchDraftBestOf, MatchDraftGameTab, MatchDraftImageSize, MatchDraftLayout, MatchDraftRow, MatchDraftSeriesFormat, MatchDraftState } from "@/lib/match-draft/types";

const sideClass: Record<DraftSide, string> = {
  blue: "border-cyan/50 bg-cyan/10 text-cyan",
  red: "border-coral/50 bg-coral/10 text-coral",
};

const imageSizes: { value: MatchDraftImageSize; label: string; grid: string; slot: string; name: string }[] = [
  { value: "xs", label: "XS", grid: "grid-cols-[repeat(6,minmax(0,1fr))] sm:grid-cols-[repeat(8,minmax(0,1fr))] lg:grid-cols-[repeat(12,minmax(0,1fr))] xl:grid-cols-[repeat(16,minmax(0,1fr))]", slot: "min-h-14", name: "text-[10px]" },
  { value: "sm", label: "SM", grid: "grid-cols-[repeat(5,minmax(0,1fr))] sm:grid-cols-[repeat(7,minmax(0,1fr))] lg:grid-cols-[repeat(10,minmax(0,1fr))] xl:grid-cols-[repeat(14,minmax(0,1fr))]", slot: "min-h-16", name: "text-[11px]" },
  { value: "md", label: "MD", grid: "grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12", slot: "min-h-20", name: "text-xs" },
  { value: "lg", label: "LG", grid: "grid-cols-3 sm:grid-cols-5 lg:grid-cols-[repeat(7,minmax(0,1fr))] xl:grid-cols-10", slot: "min-h-24", name: "text-sm" },
];

const sizeByValue = Object.fromEntries(imageSizes.map((size) => [size.value, size])) as Record<MatchDraftImageSize, (typeof imageSizes)[number]>;

function TeamMark({ team, side }: { team: MatchDraftState["blueTeam"]; side: DraftSide }) {
  return (
    <div className={`flex items-center gap-3 rounded border px-3 py-2 ${sideClass[side]}`}>
      {team.imageUrl ? (
        // Team image URLs come from admin-entered Supabase Storage/public URLs.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.imageUrl} alt="" className="h-10 w-10 rounded object-contain" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded bg-panel font-display text-sm font-bold not-italic">
          {team.abbreviation.slice(0, 2)}
        </span>
      )}
      <div className="min-w-0">
        <p className="font-display text-xl font-bold not-italic">{team.abbreviation}</p>
        <p className="truncate text-xs text-steel">{team.name}</p>
      </div>
    </div>
  );
}

function DraftSlot({
  side,
  kind,
  slot,
  action,
  active,
  playerName,
  imageSize,
}: {
  side: DraftSide;
  kind: DraftActionKind;
  slot: number;
  action: MatchDraftAction | null;
  active: boolean;
  playerName: string;
  imageSize: MatchDraftImageSize;
}) {
  const champion = action?.champion ? championByName(action.champion) : null;
  const size = sizeByValue[imageSize];
  return (
    <div
      className={`relative overflow-hidden border px-2 py-2 ${size.slot} ${
        active ? "border-gold bg-gold/10" : action ? "border-line bg-navy/70" : "border-dashed border-line bg-panel/70"
      }`}
    >
      {champion ? (
        // Riot Data Dragon splash art is served from a fixed CDN URL.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={champion.splashUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
      ) : null}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 to-transparent" />
      <div className="relative flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-steel">
        <span>{kind} {slot}</span>
        <span>{side}</span>
      </div>
      <p className={`relative truncate font-display font-semibold not-italic text-white ${imageSize === "xs" || imageSize === "sm" ? "mt-3 text-sm" : "mt-4 text-base"}`}>
        {action?.champion ?? "Open"}
      </p>
      {kind === "pick" ? (
        <p className="relative mt-1 truncate text-xs text-steel">{action?.playerName || playerName}</p>
      ) : null}
    </div>
  );
}

function SlotColumn({
  side,
  actions,
  currentStepIndex,
  players,
  imageSize,
}: {
  side: DraftSide;
  actions: MatchDraftAction[];
  currentStepIndex: number;
  players: string[];
  imageSize: MatchDraftImageSize;
}) {
  return (
    <div className="grid gap-2">
      {LCS_DRAFT_STEPS.filter((step) => step.side === side && step.kind === "pick").map((step) => (
        <DraftSlot
          key={`${step.side}-${step.kind}-${step.slot}`}
          side={step.side}
          kind={step.kind}
          slot={step.slot}
          action={actionForStep(actions, step)}
          active={step.index === currentStepIndex}
          playerName={players[step.slot - 1] ?? "Player TBD"}
          imageSize={imageSize}
        />
      ))}
    </div>
  );
}

function BanTile({ step, action, active }: { step: (typeof LCS_DRAFT_STEPS)[number]; action: MatchDraftAction | null; active: boolean }) {
  const champion = action?.champion ? championByName(action.champion) : null;
  return (
    <div
      data-testid={`ban-${step.side}-${step.slot}`}
      title={action?.champion ?? `Ban ${step.slot}`}
      className={`relative aspect-square overflow-hidden rounded border ${
        active ? "border-gold bg-gold/10" : action ? "border-line bg-navy/70" : "border-dashed border-line bg-panel/70"
      }`}
    >
      {champion ? (
        <>
          {/* Riot Data Dragon square icon — banned champs render grayscale with a strike. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={champion.iconUrl} alt={champion.name} className="h-full w-full object-cover grayscale-[45%]" loading="lazy" />
          <span aria-hidden className="absolute left-1/2 top-1/2 h-[145%] w-[3px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-red-500/80" />
          <span className="absolute inset-x-0 bottom-0 truncate bg-black/80 px-1 py-0.5 text-center text-[10px] font-semibold text-white">
            {champion.name}
          </span>
        </>
      ) : (
        <span className="flex h-full items-center justify-center font-mono text-xs font-semibold text-steel">B{step.slot}</span>
      )}
    </div>
  );
}

function BanRow({ side, actions, currentStepIndex }: { side: DraftSide; actions: MatchDraftAction[]; currentStepIndex: number }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-steel">Bans</p>
      <div className="grid grid-cols-5 gap-1.5">
        {LCS_DRAFT_STEPS.filter((step) => step.side === side && step.kind === "ban").map((step) => (
          <BanTile
            key={`${step.side}-ban-${step.slot}`}
            step={step}
            action={actionForStep(actions, step)}
            active={step.index === currentStepIndex}
          />
        ))}
      </div>
    </div>
  );
}

/** Supabase/Postgrest errors are plain objects, not Error instances — pull a
 *  human message out of whatever was thrown, and translate the RLS rejection
 *  every non-captain visitor hits into plain language. */
function saveErrorMessage(err: unknown, fallback: string): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof (err as { message?: unknown })?.message === "string"
        ? (err as { message: string }).message
        : "";
  if (!raw) return fallback;
  if (/row-level security|permission denied|violates row-level/i.test(raw)) {
    return "You don't have permission to draft this match — sign in as one of this fixture's captains or an admin.";
  }
  if (/JWT|token|not authenticated/i.test(raw)) {
    return "You're not signed in — log in as a captain or admin to draft.";
  }
  return `${fallback} (${raw})`;
}

const BEST_OF_OPTIONS: MatchDraftBestOf[] = [1, 3, 5];

const ROLE_FILTERS: { value: ChampionRole; label: string }[] = [
  { value: "top", label: "Top" },
  { value: "jungle", label: "Jungle" },
  { value: "mid", label: "Mid" },
  { value: "adc", label: "ADC" },
  { value: "support", label: "Support" },
];

/** Seconds left on the current turn, ticking once a second. Returns null
 *  until the clock should be shown (no turn start yet). Display only — the
 *  drafter does not auto-skip when it reaches zero. */
function useTurnCountdown(turnStartedAt: string | null, running: boolean): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  if (!running || !turnStartedAt) return null;
  const elapsed = Math.floor((now - new Date(turnStartedAt).getTime()) / 1000);
  return Math.max(0, DRAFT_TURN_SECONDS - Math.max(0, elapsed));
}

export default function MatchDraftBoard({
  initialState,
  games = [],
  seriesFormat = { bestOf: 3, fearless: true },
  canReset = false,
  onSave,
}: {
  initialState: MatchDraftState;
  /** Game tabs for the whole series — one shared URL, ?game= switches. */
  games?: MatchDraftGameTab[];
  /** The series' drafter format (Bo1/Bo3/Bo5 + fearless), from
   *  match_draft_settings with code defaults when unset. */
  seriesFormat?: MatchDraftSeriesFormat;
  /** Admin-only: renders the reset controls. The database policies are the
   *  real gate; this only controls presentation. */
  canReset?: boolean;
  onSave?: (state: MatchDraftState) => void | Promise<void>;
}) {
  const supabase = useMemo(() => (onSave ? null : createClient()), [onSave]);
  const [state, setState] = useState(initialState);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<ChampionRole | null>(null);
  const [imageSizeIndex, setImageSizeIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentStep = LCS_DRAFT_STEPS[state.currentStepIndex] ?? LCS_DRAFT_STEPS[LCS_DRAFT_STEPS.length - 1];
  const currentAction = currentStep ? actionForStep(state.actions, currentStep) : null;
  const filteredChampions = CHAMPIONS.filter(
    (champion) =>
      champion.name.toLowerCase().includes(query.trim().toLowerCase()) &&
      (!roleFilter || champion.roles.includes(roleFilter)),
  );
  const imageSize = imageSizes[imageSizeIndex].value;
  const draftStarted = state.actions.length > 0;
  const bothReady = state.blueReady && state.redReady;
  const drafting = state.status !== "complete";
  const clockRunning = drafting && (draftStarted || bothReady);
  const secondsLeft = useTurnCountdown(state.turnStartedAt, clockRunning);

  // Live sync: both captains (and spectators) see picks, readiness, side
  // swaps, and resets as they happen. Team identity changes and row deletes
  // need server-resolved data (rosters, fearless blocks), so those reload.
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel(`match-draft-${initialState.fixtureId}-${initialState.gameNumber}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_drafts", filter: `fixture_id=eq.${initialState.fixtureId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            window.location.reload();
            return;
          }
          const row = payload.new as MatchDraftRow;
          if (row.game_number !== initialState.gameNumber) return;
          setState((current) => {
            if (
              (row.blue_team_name && row.blue_team_name !== current.blueTeam.name) ||
              (row.red_team_name && row.red_team_name !== current.redTeam.name)
            ) {
              window.location.reload();
              return current;
            }
            const actions = (row.actions ?? []).filter((action) => Boolean(action?.champion));
            return {
              ...current,
              status: row.status,
              currentStepIndex: row.current_step_index,
              turnStartedAt: row.turn_started_at,
              blueReady: row.blue_ready ?? false,
              redReady: row.red_ready ?? false,
              actions,
              canChooseSides: current.gameNumber > 1 && actions.length === 0,
            };
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, initialState.fixtureId, initialState.gameNumber]);

  const setLayout = (layout: MatchDraftLayout) => setState((current) => ({ ...current, layout }));
  const teamForSide = (side: DraftSide) => (side === "blue" ? state.blueTeam : state.redTeam);
  const playersForSide = (side: DraftSide) => teamForSide(side).players;
  const playerForCurrentPick = (side: DraftSide, slot?: number) => playersForSide(side)[(slot ?? 1) - 1] ?? "Player TBD";

  const persist = async (next: MatchDraftState) => {
    if (onSave) {
      await onSave(next);
      return;
    }
    if (!supabase) return;
    const { error: saveError } = await supabase.from("match_drafts").upsert({
      fixture_id: next.fixtureId,
      game_number: next.gameNumber,
      status: next.status,
      layout: next.layout,
      current_step_index: next.currentStepIndex,
      turn_started_at: new Date().toISOString(),
      blue_team_name: next.blueTeam.name,
      red_team_name: next.redTeam.name,
      blue_ready: next.blueReady,
      red_ready: next.redReady,
      actions: next.actions,
    }, { onConflict: "fixture_id,game_number" });
    if (saveError) throw saveError;
  };

  const selectChampion = async (champion: string) => {
    const started = state.actions.length > 0;
    const ready = state.blueReady && state.redReady;
    if (!started && !ready) return;
    if (!currentStep || state.sideChoiceRequired || isChampionUnavailable(champion, state.actions, state.blockedChampions)) return;
    const nextActions = state.actions.filter((action) => {
      if (typeof action.stepIndex === "number") return action.stepIndex !== currentStep.index;
      return !(action.side === currentStep.side && action.kind === currentStep.kind && action.slot === currentStep.slot);
    });
    const nextStepIndex = Math.min(state.currentStepIndex + 1, LCS_DRAFT_STEPS.length - 1);
    const next: MatchDraftState = {
      ...state,
      currentStepIndex: nextStepIndex,
      status: state.currentStepIndex >= LCS_DRAFT_STEPS.length - 1 ? "complete" : "drafting",
      turnStartedAt: new Date().toISOString(),
      actions: [
        ...nextActions,
        {
          stepIndex: currentStep.index,
          side: currentStep.side,
          kind: currentStep.kind,
          slot: currentStep.slot,
          champion,
          playerName: currentStep.kind === "pick" ? playerForCurrentPick(currentStep.side, currentStep.slot) : null,
        },
      ],
    };
    setSaving(true);
    setError(null);
    try {
      await persist(next);
      setState(next);
    } catch (err) {
      setError(saveErrorMessage(err, "Draft could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const chooseBlueTeam = async (blueTeam: MatchDraftState["blueTeam"]) => {
    if (!state.canChooseSides || state.actions.length > 0) return;
    const redTeam = state.scheduledTeams.find((team) => team.name !== blueTeam.name) ?? state.redTeam;
    const next: MatchDraftState = { ...state, blueTeam, redTeam, sideChoiceRequired: false };
    setSaving(true);
    setError(null);
    try {
      await persist(next);
      setState(next);
    } catch (err) {
      setError(saveErrorMessage(err, "Sides could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const toggleReady = async (side: DraftSide) => {
    if (state.sideChoiceRequired || draftStarted) return;
    const next: MatchDraftState = {
      ...state,
      blueReady: side === "blue" ? !state.blueReady : state.blueReady,
      redReady: side === "red" ? !state.redReady : state.redReady,
    };
    // Both just went ready: the first turn's clock starts now.
    if (next.blueReady && next.redReady) next.turnStartedAt = new Date().toISOString();
    setSaving(true);
    setError(null);
    try {
      await persist(next);
      setState(next);
    } catch (err) {
      setError(saveErrorMessage(err, "Ready check could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const saveSeriesFormat = async (change: Partial<MatchDraftSeriesFormat>) => {
    if (!supabase) return;
    const next = { ...seriesFormat, ...change };
    setSaving(true);
    setError(null);
    try {
      const { error: saveError } = await supabase.from("match_draft_settings").upsert(
        { fixture_id: state.fixtureId, best_of: next.bestOf, fearless: next.fearless },
        { onConflict: "fixture_id" },
      );
      if (saveError) throw saveError;
      // Tab count and fearless blocks are server-derived — rebuild the page.
      window.location.reload();
    } catch (err) {
      setError(saveErrorMessage(err, "Format could not be saved."));
      setSaving(false);
    }
  };

  const resetDraft = async (scope: "game" | "series") => {
    if (!supabase) return;
    const label = scope === "game" ? `game ${state.gameNumber}'s draft` : "every game's draft in this series";
    if (!window.confirm(`Reset ${label}? This cannot be undone.`)) return;
    setSaving(true);
    setError(null);
    try {
      let query = supabase.from("match_drafts").delete().eq("fixture_id", state.fixtureId);
      if (scope === "game") query = query.eq("game_number", state.gameNumber);
      const { error: deleteError } = await query;
      if (deleteError) throw deleteError;
      // Rebuild everything (fearless blocks included) from the server.
      window.location.reload();
    } catch (err) {
      setError(saveErrorMessage(err, "Draft could not be reset."));
      setSaving(false);
    }
  };

  const gameTabs = games.length > 1 ? (
    <nav aria-label="Series games" className="flex flex-wrap items-center gap-1.5">
      {games.map((game) => {
        const active = game.gameNumber === state.gameNumber;
        return (
          <Link
            key={game.gameNumber}
            href={game.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
              active ? "bg-coral text-navy" : "border border-line bg-panel text-steel hover:text-white"
            }`}
          >
            Game {game.gameNumber}
            {game.status === "complete" ? <span aria-label="complete" className={active ? "text-navy" : "text-mint"}>✓</span> : null}
            {game.status === "drafting" ? <span aria-label="in progress" className={active ? "text-navy" : "text-gold"}>●</span> : null}
          </Link>
        );
      })}
    </nav>
  ) : null;

  const readyCheck = drafting && !draftStarted ? (
    <section className="card-brand flex flex-wrap items-center gap-3 p-3" aria-label="Ready check">
      <span className="label-dash">{bothReady ? "Both teams ready" : "Ready check"}</span>
      {(["blue", "red"] as DraftSide[]).map((side) => {
        const isReady = side === "blue" ? state.blueReady : state.redReady;
        return (
          <button
            key={side}
            type="button"
            disabled={saving || state.sideChoiceRequired}
            aria-pressed={isReady}
            onClick={() => void toggleReady(side)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition disabled:opacity-40 ${
              isReady
                ? "border border-mint/60 bg-mint/15 text-mint"
                : `border ${sideClass[side]} hover:brightness-125`
            }`}
          >
            {teamForSide(side).abbreviation} {isReady ? "ready ✓" : "ready?"}
          </button>
        );
      })}
      <span className="text-xs text-steel">
        {state.sideChoiceRequired
          ? "Choose sides first."
          : bothReady
            ? "The clock is running — blue's first ban is up."
            : "Picks unlock once both teams check in."}
      </span>
    </section>
  ) : null;

  const sideChooser = state.canChooseSides && state.actions.length === 0 ? (
    <section className="card-brand flex flex-wrap items-center gap-3 p-3" aria-label="Side selection">
      <span className="label-dash">{state.sideChoiceRequired ? "Choose sides to start" : "Choose sides"}</span>
      {state.scheduledTeams.map((team) => (
        <button
          key={team.name}
          type="button"
          disabled={saving}
          onClick={() => void chooseBlueTeam(team)}
          aria-pressed={state.blueTeam.name === team.name}
          className="btn-pill px-3 py-1.5 text-xs"
        >
          {team.name} blue side
        </button>
      ))}
    </section>
  ) : null;

  const championPool = (
    <section className="min-w-0 rounded border border-line bg-navy/60 p-3" aria-label="Champion pool">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-steel sm:max-w-xs">
          Search champions
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="input-brand px-3 py-2 text-sm" />
        </label>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Role filter">
          <button
            type="button"
            aria-pressed={roleFilter === null}
            onClick={() => setRoleFilter(null)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
              roleFilter === null ? "bg-coral text-navy" : "border border-line bg-panel text-steel hover:text-white"
            }`}
          >
            All
          </button>
          {ROLE_FILTERS.map((role) => (
            <button
              key={role.value}
              type="button"
              aria-pressed={roleFilter === role.value}
              onClick={() => setRoleFilter((current) => (current === role.value ? null : role.value))}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
                roleFilter === role.value ? "bg-coral text-navy" : "border border-line bg-panel text-steel hover:text-white"
              }`}
            >
              {role.label}
            </button>
          ))}
        </div>
      </div>
      <div className={`mt-3 grid gap-2 ${sizeByValue[imageSize].grid}`} data-testid="champion-pool-grid" data-size={imageSize}>
        {filteredChampions.map((champion) => {
          const unavailable = isChampionUnavailable(champion.name, state.actions, state.blockedChampions);
          return (
            <button
              key={champion.id}
              type="button"
              disabled={unavailable || saving || state.sideChoiceRequired || (!draftStarted && !bothReady)}
              onClick={() => void selectChampion(champion.name)}
              aria-label={`${champion.name}${unavailable ? " unavailable" : ""}`}
              className={`group relative aspect-square overflow-hidden border border-line bg-panel text-left font-semibold text-white hover:border-coral disabled:cursor-not-allowed disabled:opacity-35 ${sizeByValue[imageSize].name}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={champion.iconUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
              <span className="absolute inset-x-0 bottom-0 bg-black/75 px-2 py-1 text-xs">{champion.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );

  const stage = (
    <section className="flex flex-col gap-4" aria-label="Stage draft layout">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
        <div className="flex flex-col gap-3">
          <TeamMark team={state.blueTeam} side="blue" />
          <SlotColumn side="blue" actions={state.actions} currentStepIndex={state.currentStepIndex} players={playersForSide("blue")} imageSize={imageSize} />
          <BanRow side="blue" actions={state.actions} currentStepIndex={state.currentStepIndex} />
        </div>
        <div className="flex min-w-32 flex-col items-center justify-center rounded border border-line bg-panel px-4 py-4 text-center">
          <span className="label-dash">Game {state.gameNumber}</span>
          <span className={`type-display mt-1 text-4xl ${secondsLeft !== null && secondsLeft <= 5 ? "animate-pulse text-red-400" : "text-white"}`}>
            {state.status === "complete" ? "Done" : secondsLeft !== null ? `${secondsLeft}s` : "—"}
          </span>
          <span className="mt-1 text-xs uppercase text-steel">
            {state.status === "complete"
              ? "draft complete"
              : clockRunning
                ? `${currentStep?.side} ${currentStep?.kind} ${currentStep?.slot}`
                : "waiting for ready check"}
          </span>
        </div>
        <div className="flex flex-col gap-3">
          <TeamMark team={state.redTeam} side="red" />
          <SlotColumn side="red" actions={state.actions} currentStepIndex={state.currentStepIndex} players={playersForSide("red")} imageSize={imageSize} />
          <BanRow side="red" actions={state.actions} currentStepIndex={state.currentStepIndex} />
        </div>
      </div>
      {championPool}
    </section>
  );

  const board = (
    <section className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_18rem]" aria-label="Board draft layout">
      <aside className="flex flex-col gap-3">
        <TeamMark team={state.blueTeam} side="blue" />
        <SlotColumn side="blue" actions={state.actions} currentStepIndex={state.currentStepIndex} players={playersForSide("blue")} imageSize={imageSize} />
        <BanRow side="blue" actions={state.actions} currentStepIndex={state.currentStepIndex} />
      </aside>
      {championPool}
      <aside className="flex flex-col gap-3">
        <TeamMark team={state.redTeam} side="red" />
        <SlotColumn side="red" actions={state.actions} currentStepIndex={state.currentStepIndex} players={playersForSide("red")} imageSize={imageSize} />
        <BanRow side="red" actions={state.actions} currentStepIndex={state.currentStepIndex} />
      </aside>
    </section>
  );

  return (
    <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-4 bg-hash px-4 py-6 text-white">
      <header className="card-brand flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <span className="label-dash">Bo{seriesFormat.bestOf}{seriesFormat.fearless ? " fearless" : ""} · Game {state.gameNumber}</span>
          <h1 className="type-display mt-1 text-2xl text-white">
            {state.blueTeam.abbreviation} vs {state.redTeam.abbreviation}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {gameTabs}
          <button type="button" aria-pressed={state.layout === "stage"} onClick={() => setLayout("stage")} className="btn-pill px-3 py-1.5 text-xs">
            Stage layout
          </button>
          <button type="button" aria-pressed={state.layout === "board"} onClick={() => setLayout("board")} className="btn-pill px-3 py-1.5 text-xs">
            Board layout
          </button>
          {canReset && !onSave ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => void resetDraft("game")}
                className="rounded-full border border-red-400/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-400 transition hover:bg-red-500/15 disabled:opacity-40"
              >
                Reset game
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void resetDraft("series")}
                className="rounded-full border border-red-400/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-400 transition hover:bg-red-500/15 disabled:opacity-40"
              >
                Reset series
              </button>
            </>
          ) : null}
        </div>
      </header>

      {sideChooser}
      {readyCheck}

      <section className="card-brand flex flex-wrap items-end gap-3 p-3">
        {!onSave ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Series format">
            <span className="label-dash">Format</span>
            {BEST_OF_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                disabled={saving}
                aria-pressed={seriesFormat.bestOf === option}
                onClick={() => (seriesFormat.bestOf === option ? undefined : void saveSeriesFormat({ bestOf: option }))}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition disabled:opacity-40 ${
                  seriesFormat.bestOf === option ? "bg-coral text-navy" : "border border-line bg-panel text-steel hover:text-white"
                }`}
              >
                Bo{option}
              </button>
            ))}
            <button
              type="button"
              disabled={saving}
              aria-pressed={seriesFormat.fearless}
              onClick={() => void saveSeriesFormat({ fearless: !seriesFormat.fearless })}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition disabled:opacity-40 ${
                seriesFormat.fearless ? "bg-mint/15 text-mint border border-mint/50" : "border border-line bg-panel text-steel hover:text-white"
              }`}
            >
              Fearless {seriesFormat.fearless ? "on" : "off"}
            </button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-dash">Image size</span>
          <button
            type="button"
            aria-label="Decrease image size"
            disabled={imageSizeIndex === 0}
            onClick={() => setImageSizeIndex((current) => Math.max(0, current - 1))}
            className="btn-pill px-3 py-1.5 text-xs disabled:opacity-40"
          >
            -
          </button>
          <span className="min-w-8 text-center text-xs font-semibold text-white">{imageSizes[imageSizeIndex].label}</span>
          <button
            type="button"
            aria-label="Increase image size"
            disabled={imageSizeIndex === imageSizes.length - 1}
            onClick={() => setImageSizeIndex((current) => Math.min(imageSizes.length - 1, current + 1))}
            className="btn-pill px-3 py-1.5 text-xs disabled:opacity-40"
          >
            +
          </button>
        </div>
        <p className="text-sm text-steel">
          Current turn: <span className="font-semibold uppercase text-white">{currentStep?.side} {currentStep?.kind} {currentStep?.slot}</span>
          {currentAction ? <span> · locked {currentAction.champion}</span> : null}
        </p>
        {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
      </section>

      {state.layout === "stage" ? stage : board}
    </main>
  );
}
