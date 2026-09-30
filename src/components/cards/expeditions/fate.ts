// How a card's fate on the route reads: its word and its colour. Shared by
// the claim ceremony and the drawer's log.

import type { CardFate } from "@/lib/expeditions/routes";

export const FATE_LABEL: Record<CardFate["fate"], string> = {
  home: "Home",
  wounded: "Wounded",
  lost: "Lost",
  dead: "Dead",
};

export const FATE_CLASS: Record<CardFate["fate"], string> = {
  home: "text-mint",
  wounded: "text-gold",
  lost: "text-coral",
  dead: "text-red-300",
};
