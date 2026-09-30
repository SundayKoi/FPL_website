"use client";

import { useRef } from "react";
import type { MatchDraftChampion } from "@/lib/match-draft/champions";
import type { DraftMatchupPickView } from "@/lib/match-draft/presentation";
import { normalizeChampionName } from "@/lib/match-draft/rules";
import type { DraftSide, MatchDraftState } from "@/lib/match-draft/types";
import { DraftPickSlot, sideClass } from "@/components/match-draft/DraftMatchupBoard";
import { teamOnSide } from "@/components/match-draft/draftBoardHelpers";
import type { RoleDrag } from "@/components/match-draft/useRoleOrders";

const ROLE_LABELS = ["Top", "Jungle", "Mid", "ADC", "Support"] as const;

/** Post-draft role confirmation: both captains drag their five picks into
 *  Top→Support order and click Ready. Arrangement state lives in
 *  useRoleOrders; this renders it and reports gestures. */
export function RoleOrderModal({
  state,
  canReset,
  viewerSide,
  saving,
  roleModalOpen,
  rolesFullyReady,
  roleOrderForSide,
  resolveChampion,
  roleDrag,
  onRoleDragChange,
  moveRoleTo,
  onClose,
  onReady,
}: {
  state: MatchDraftState;
  canReset: boolean;
  viewerSide: DraftSide | null;
  saving: boolean;
  roleModalOpen: boolean;
  rolesFullyReady: boolean;
  roleOrderForSide: (side: DraftSide) => (string | null)[];
  resolveChampion: (name: string) => MatchDraftChampion | null;
  roleDrag: RoleDrag | null;
  onRoleDragChange: (drag: RoleDrag | null) => void;
  moveRoleTo: (side: DraftSide, from: number, to: number) => void;
  onClose: () => void;
  onReady: (side: DraftSide) => void;
}) {
  const roleListsRef = useRef<Record<DraftSide, HTMLDivElement | null>>({ blue: null, red: null });

  const roleRowAtY = (side: DraftSide, clientY: number): number | null => {
    const list = roleListsRef.current[side];
    if (!list) return null;
    const rows = Array.from(list.children) as HTMLElement[];
    for (let i = 0; i < rows.length; i += 1) {
      const rect = rows[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return rows.length - 1;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Confirm roles">
      <div className="card-brand w-full max-w-5xl p-4 shadow-[0_16px_64px_rgb(0_0_0/0.65)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="label-dash">Post-draft role confirmation</span>
            <h2 className="type-display mt-1 text-2xl text-white sm:text-3xl">Set your team&apos;s roles</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Drag the champion pick tiles into Top, Jungle, Mid, ADC, and Support order. Both captains must click Ready before the roles are locked in.
            </p>
          </div>
          {rolesFullyReady ? (
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="rounded-full border border-border-subtle px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted transition hover:text-white disabled:opacity-40"
            >
              Close
            </button>
          ) : null}
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {(["blue", "red"] as DraftSide[]).map((side) => {
            const editable = canReset || viewerSide === side;
            const confirmed = Boolean(state.positions?.[side]);
            const order = roleOrderForSide(side);
            const team = teamOnSide(state, side);
            const roster = team.players;
            return (
              <section key={side} className={`rounded border p-3 ${sideClass[side]}`} aria-label={`${team.abbreviation} role confirmation`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wide">{team.abbreviation}</span>
                    <p className="mt-1 text-xs text-muted">{team.name}</p>
                  </div>
                  <span className={`text-[11px] font-semibold uppercase tracking-wide ${confirmed ? "text-mint" : "text-muted"}`}>
                    {confirmed ? "Ready ✓" : editable ? "Arrange picks" : "Waiting for captain"}
                  </span>
                </div>
                <div
                  ref={(element) => {
                    roleListsRef.current[side] = element;
                  }}
                  role="list"
                  aria-label={`${team.abbreviation} champion picks`}
                  className="mt-3 grid gap-2"
                >
                  {order.map((champion, index) => {
                    const action = champion
                      ? state.actions.find(
                          (entry) =>
                            entry.kind === "pick" &&
                            entry.side === side &&
                            entry.champion &&
                            normalizeChampionName(entry.champion) === normalizeChampionName(champion),
                        ) ?? null
                      : null;
                    const pick: DraftMatchupPickView = {
                      side,
                      slot: index + 1,
                      pickNumber: action?.slot ?? null,
                      stepIndex: action?.stepIndex ?? null,
                      champion: action?.champion ?? null,
                      playerName: roster[index] ?? action?.playerName ?? null,
                      role: ROLE_LABELS[index],
                      state: action ? action.skipped || !action.champion ? "skipped" : "recorded" : "missing",
                    };
                    const dragging = roleDrag?.side === side && roleDrag.index === index;
                    const interactive = editable && (!confirmed || roleModalOpen);
                    return (
                      <DraftPickSlot
                        key={`${side}-role-modal-${index}`}
                        side={side}
                        pick={pick}
                        active={false}
                        imageSize="md"
                        resolve={resolveChampion}
                        label={ROLE_LABELS[index]}
                        emptyLabel="Skipped"
                        role="listitem"
                        interactive={interactive}
                        ariaLabel={`${champion ?? "Skipped pick"} — ${ROLE_LABELS[index]} role${interactive ? ", drag to reorder" : ""}`}
                        onPointerDown={
                          interactive
                            ? (event) => {
                                event.preventDefault();
                                event.currentTarget.setPointerCapture(event.pointerId);
                                onRoleDragChange({ side, index });
                              }
                            : undefined
                        }
                        onPointerMove={
                          interactive
                            ? (event) => {
                                if (roleDrag?.side !== side || roleDrag.index === null) return;
                                const target = roleRowAtY(side, event.clientY);
                                if (target !== null && target !== roleDrag.index) {
                                  moveRoleTo(side, roleDrag.index, target);
                                  onRoleDragChange({ side, index: target });
                                }
                              }
                            : undefined
                        }
                        onPointerUp={interactive ? () => onRoleDragChange(null) : undefined}
                        onPointerCancel={interactive ? () => onRoleDragChange(null) : undefined}
                        onKeyDown={
                          interactive
                            ? (event) => {
                                if (event.key === "ArrowUp") {
                                  event.preventDefault();
                                  moveRoleTo(side, index, index - 1);
                                } else if (event.key === "ArrowDown") {
                                  event.preventDefault();
                                  moveRoleTo(side, index, index + 1);
                                }
                              }
                            : undefined
                        }
                        slotClassName={dragging ? "shadow-[0_0_0_2px] shadow-coral" : ""}
                      />
                    );
                  })}
                </div>
                {editable ? (
                  <button
                    type="button"
                    disabled={saving}
                    aria-pressed={confirmed}
                    onClick={() => onReady(side)}
                    className={`mt-3 w-full rounded-full border-2 px-4 py-2 text-sm font-bold uppercase tracking-wide transition disabled:opacity-40 ${
                      confirmed ? "border-mint/70 bg-mint/15 text-mint" : "border-coral/70 bg-coral/15 text-coral hover:bg-coral/25"
                    }`}
                  >
                    {team.abbreviation} {confirmed ? "ready ✓" : "ready"}
                  </button>
                ) : null}
              </section>
            );
          })}
        </div>
        <p className="mt-4 text-center text-xs uppercase tracking-wide text-muted">
          {rolesFullyReady ? "Both captains are ready — roles confirmed." : `Waiting on ${(["blue", "red"] as DraftSide[]).filter((side) => !state.positions?.[side]).map((side) => teamOnSide(state, side).abbreviation).join(" and ")} to click Ready.`}
        </p>
      </div>
    </div>
  );
}
