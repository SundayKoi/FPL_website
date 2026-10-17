// The homepage's way into the offseason: the newest event while it runs.
// A failed read hides the banner rather than taking the homepage down.

import { createServerSupabase } from "@/lib/supabase/server";
import { fetchLatestEvent } from "./queries";
import type { OffseasonEvent } from "./types";

export type HomeOffseasonEvent = Pick<OffseasonEvent, "name" | "status" | "signups_open">;

/** The newest event unless it is complete; null when there is none or the read fails. */
export async function fetchHomeOffseasonEvent(): Promise<HomeOffseasonEvent | null> {
  try {
    const event = await fetchLatestEvent(await createServerSupabase());
    if (!event || event.status === "complete") return null;
    return { name: event.name, status: event.status, signups_open: event.signups_open };
  } catch {
    return null;
  }
}
