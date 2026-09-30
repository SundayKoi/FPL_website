// The living map's words that are not a place's own: the chart's
// accessible summary, the cartouche's weather, the league goal's line, and
// the landmark lines printed under a chart with no room for them.

import { EXPEDITION_TIERS } from "@/lib/expeditions/config";
import type { RunView } from "@/lib/expeditions/views";
import type { MapGoal } from "./LivingMap";
import type { MapModel } from "./mapLayout";

export const WEATHER_WORD: Record<string, string> = { fog: "under fog", drought: "in drought", harvest: "at harvest", watch: "under the Watch" };

export function summary(view: RunView, model: MapModel): string {
  const unknown = view.road.filter((place) => !place.known).length;
  const warned = view.road.filter((place) => place.warned && (place.status === "pending" || place.status === "open")).length;
  const parts = [`${EXPEDITION_TIERS[view.tier].label} chart`, `${view.road.length} checkpoint${view.road.length === 1 ? "" : "s"}`];
  if (unknown > 0) parts.push(`${unknown} not yet known`);
  if (warned > 0) parts.push(`the squad dreads ${warned}`);
  if (model.squad) parts.push(`the squad is ${Math.round(model.squad.fraction * 100)}% of the way`);
  return `${parts.join(", ")}.`;
}

/** A landmark the league named is news: where the chart has no room for
 *  its place's name (a phone names two places; a small chart leaves off
 *  what would crowd), it is printed under the chart instead. Before the
 *  map is measured, the names only a roomy chart prints are listed too,
 *  for the narrow map globals.css shows them on. */
export function landmarkLines(model: MapModel, unsettled: boolean): CaptionLine[] {
  return model.places.flatMap((spot) => {
    const place = spot.place;
    if (!place.known || !place.landmark) return [];
    if (spot.labelled && (spot.keep || !unsettled)) return [];
    const who = place.landmark.mine ? "you" : place.landmark.by;
    return [{ text: `${place.landmark.crest ? "✦ " : ""}First to ${place.title.toLowerCase()}: ${who}`, compactOnly: spot.labelled }];
  });
}

export interface CaptionLine {
  text: string;
  /** Shown only where the chart turns out compact (the server's chart). */
  compactOnly: boolean;
}

export function goalLine(goal: MapGoal): string {
  const done = Math.min(goal.done, goal.target);
  return `League ${goal.kind === "boss" ? "boss" : "landmark"} · ${done} of ${goal.target} ${goal.unit}`;
}
