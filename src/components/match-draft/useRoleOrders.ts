"use client";

import { useState } from "react";
import { actionForStep, LCS_DRAFT_STEPS } from "@/lib/match-draft/rules";
import type { DraftSide, MatchDraftState } from "@/lib/match-draft/types";

type RoleOrders = Partial<Record<DraftSide, (string | null)[]>>;

export type RoleDrag = { side: DraftSide; index: number };

/**
 * Post-draft role confirmation: each side's working top→support
 * arrangement stays local until that captain clicks Ready.
 */
export function useRoleOrders(state: MatchDraftState) {
  const [roleOrders, setRoleOrders] = useState<RoleOrders>({});
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleDrag, setRoleDrag] = useState<RoleDrag | null>(null);

  /** The side's five picks in the order they were drafted (nulls = skips) —
   *  the starting arrangement for role confirmation. */
  const picksInDraftOrder = (side: DraftSide): (string | null)[] =>
    LCS_DRAFT_STEPS.filter((step) => step.side === side && step.kind === "pick").map(
      (step) => actionForStep(state.actions, step)?.champion ?? null,
    );

  const roleOrderForSide = (side: DraftSide): (string | null)[] =>
    roleOrders[side] ?? state.positions?.[side] ?? picksInDraftOrder(side);

  const openRoleConfirmation = () => {
    setRoleOrders({
      blue: state.positions?.blue ?? picksInDraftOrder("blue"),
      red: state.positions?.red ?? picksInDraftOrder("red"),
    });
    setRoleModalOpen(true);
  };

  /** Move the entry at `from` to position `to` (others shift, drag-style). */
  const moveRoleTo = (side: DraftSide, from: number, to: number) =>
    setRoleOrders((current) => {
      const currentOrder = current[side] ?? state.positions?.[side] ?? picksInDraftOrder(side);
      if (from === to || from < 0 || to < 0 || from >= currentOrder.length || to >= currentOrder.length) return current;
      const order = [...currentOrder];
      const [moved] = order.splice(from, 1);
      order.splice(to, 0, moved);
      return { ...current, [side]: order };
    });

  /** Drop the working arrangement — used when switching games. */
  const resetRoleOrders = () => {
    setRoleModalOpen(false);
    setRoleOrders({});
    setRoleDrag(null);
  };

  return {
    roleModalOpen,
    setRoleModalOpen,
    roleDrag,
    setRoleDrag,
    roleOrderForSide,
    openRoleConfirmation,
    moveRoleTo,
    resetRoleOrders,
  };
}
