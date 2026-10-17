// The homepage's way into the offseason: the newest event while it runs, and
// what its latest week does next. A failed read hides the banner rather than
// taking the homepage down.

import { createServerSupabase } from "@/lib/supabase/server";
import { fetchLatestEvent } from "./queries";
import { nextWeekMoment, type WeekMoment } from "./times";
import type { OffseasonEvent, OffseasonWeek } from "./types";

export type HomeOffseasonEvent = Pick<OffseasonEvent, "name" | "status" | "signups_open"> & {
  /** The latest week's upcoming draft, else its games; null when neither is set or both have passed. */
  next: WeekMoment | null;
};

/** The newest event unless it is complete; null when there is none or the read fails. */
export async function fetchHomeOffseasonEvent(now: number = Date.now()): Promise<HomeOffseasonEvent | null> {
  try {
    const supabase = await createServerSupabase();
    const event = await fetchLatestEvent(supabase);
    if (!event || event.status === "complete") return null;
    const { data: week, error } = await supabase
      .from("offseason_weeks")
      .select("week_number, draft_at, games_at")
      .eq("event_id", event.id)
      .order("week_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const latest = week as Pick<OffseasonWeek, "week_number" | "draft_at" | "games_at"> | null;
    return {
      name: event.name,
      status: event.status,
      signups_open: event.signups_open,
      next: latest ? nextWeekMoment(latest, now) : null,
    };
  } catch {
    return null;
  }
}
