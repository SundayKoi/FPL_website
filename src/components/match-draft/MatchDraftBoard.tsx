"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CHAMPIONS, championByName } from "@/lib/match-draft/champions";
import { actionForStep, isChampionUnavailable, LCS_DRAFT_STEPS } from "@/lib/match-draft/rules";
import type { DraftActionKind, DraftSide, MatchDraftAction, MatchDraftLayout, MatchDraftState } from "@/lib/match-draft/types";

const sideClass: Record<DraftSide, string> = {
  blue: "border-cyan/50 bg-cyan/10 text-cyan",
  red: "border-coral/50 bg-coral/10 text-coral",
};

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
}: {
  side: DraftSide;
  kind: DraftActionKind;
  slot: number;
  action: MatchDraftAction | null;
  active: boolean;
}) {
  const champion = action?.champion ? championByName(action.champion) : null;
  return (
    <div
      className={`relative min-h-28 overflow-hidden border px-2 py-2 ${
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
      <p className="relative mt-8 truncate font-display text-lg font-semibold not-italic text-white">
        {action?.champion ?? "Open"}
      </p>
      {kind === "pick" ? (
        <p className="relative mt-1 truncate text-xs text-steel">{action?.playerName || "Player TBD"}</p>
      ) : null}
    </div>
  );
}

function SlotColumn({
  side,
  actions,
  currentStepIndex,
}: {
  side: DraftSide;
  actions: MatchDraftAction[];
  currentStepIndex: number;
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
        />
      ))}
    </div>
  );
}

function BanRow({ side, actions }: { side: DraftSide; actions: MatchDraftAction[] }) {
  return (
    <div className="grid grid-cols-5 gap-1">
      {LCS_DRAFT_STEPS.filter((step) => step.side === side && step.kind === "ban").map((step) => {
        const action = actionForStep(actions, step);
        return (
          <div key={`${step.side}-ban-${step.slot}`} className="border border-line bg-panel px-1 py-1 text-center text-[10px] text-steel">
            {action?.champion ?? `B${step.slot}`}
          </div>
        );
      })}
    </div>
  );
}

export default function MatchDraftBoard({
  initialState,
  onSave,
}: {
  initialState: MatchDraftState;
  onSave?: (state: MatchDraftState) => void | Promise<void>;
}) {
  const supabase = useMemo(() => (onSave ? null : createClient()), [onSave]);
  const [state, setState] = useState(initialState);
  const [query, setQuery] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentStep = LCS_DRAFT_STEPS[state.currentStepIndex] ?? LCS_DRAFT_STEPS[LCS_DRAFT_STEPS.length - 1];
  const currentAction = currentStep ? actionForStep(state.actions, currentStep) : null;
  const filteredChampions = CHAMPIONS.filter((champion) => champion.name.toLowerCase().includes(query.trim().toLowerCase()));

  const setLayout = (layout: MatchDraftLayout) => setState((current) => ({ ...current, layout }));

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
      actions: next.actions,
    }, { onConflict: "fixture_id,game_number" });
    if (saveError) throw saveError;
  };

  const selectChampion = async (champion: string) => {
    if (!currentStep || isChampionUnavailable(champion, state.actions, state.blockedChampions)) return;
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
          playerName: currentStep.kind === "pick" ? playerName.trim() || null : null,
        },
      ],
    };
    setSaving(true);
    setError(null);
    try {
      await persist(next);
      setState(next);
      setPlayerName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draft could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const championPool = (
    <section className="min-w-0 rounded border border-line bg-navy/60 p-3" aria-label="Champion pool">
      <label className="flex flex-col gap-1 text-xs text-steel">
        Search champions
        <input value={query} onChange={(e) => setQuery(e.target.value)} className="input-brand px-3 py-2 text-sm" />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {filteredChampions.map((champion) => {
          const unavailable = isChampionUnavailable(champion.name, state.actions, state.blockedChampions);
          return (
            <button
              key={champion.id}
              type="button"
              disabled={unavailable || saving}
              onClick={() => void selectChampion(champion.name)}
              aria-label={`${champion.name}${unavailable ? " unavailable" : ""}`}
              className="group relative aspect-[4/3] overflow-hidden border border-line bg-panel text-left text-sm font-semibold text-white hover:border-coral disabled:cursor-not-allowed disabled:opacity-35"
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
          <SlotColumn side="blue" actions={state.actions} currentStepIndex={state.currentStepIndex} />
          <BanRow side="blue" actions={state.actions} />
        </div>
        <div className="flex min-w-32 flex-col items-center justify-center rounded border border-line bg-panel px-4 py-4 text-center">
          <span className="label-dash">Game {state.gameNumber}</span>
          <span className="type-display mt-1 text-4xl text-white">30s</span>
          <span className="mt-1 text-xs uppercase text-steel">
            {currentStep?.side} {currentStep?.kind} {currentStep?.slot}
          </span>
        </div>
        <div className="flex flex-col gap-3">
          <TeamMark team={state.redTeam} side="red" />
          <SlotColumn side="red" actions={state.actions} currentStepIndex={state.currentStepIndex} />
          <BanRow side="red" actions={state.actions} />
        </div>
      </div>
      {championPool}
    </section>
  );

  const board = (
    <section className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_18rem]" aria-label="Board draft layout">
      <aside className="flex flex-col gap-3">
        <TeamMark team={state.blueTeam} side="blue" />
        <SlotColumn side="blue" actions={state.actions} currentStepIndex={state.currentStepIndex} />
        <BanRow side="blue" actions={state.actions} />
      </aside>
      {championPool}
      <aside className="flex flex-col gap-3">
        <TeamMark team={state.redTeam} side="red" />
        <SlotColumn side="red" actions={state.actions} currentStepIndex={state.currentStepIndex} />
        <BanRow side="red" actions={state.actions} />
      </aside>
    </section>
  );

  return (
    <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-4 bg-hash px-4 py-6 text-white">
      <header className="card-brand flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <span className="label-dash">Bo3 fearless · Game {state.gameNumber}</span>
          <h1 className="type-display mt-1 text-2xl text-white">
            {state.blueTeam.abbreviation} vs {state.redTeam.abbreviation}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={state.layout === "stage"} onClick={() => setLayout("stage")} className="btn-pill px-3 py-1.5 text-xs">
            Stage layout
          </button>
          <button type="button" aria-pressed={state.layout === "board"} onClick={() => setLayout("board")} className="btn-pill px-3 py-1.5 text-xs">
            Board layout
          </button>
        </div>
      </header>

      <section className="card-brand flex flex-wrap items-end gap-3 p-3">
        <label className="flex min-w-56 flex-col gap-1 text-xs text-steel">
          Player name for next pick
          <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} className="input-brand px-3 py-2 text-sm" />
        </label>
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
