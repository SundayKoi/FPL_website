import "server-only";

// What every offseason page starts from: the event, the viewer, and whether
// they are staff. `isStaff` decides what a page shows; the database checks
// staff again on every write.

import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadOffseason } from "./queries";
import type { OffseasonEntrant } from "./types";
import type { OffseasonView } from "./view";

export interface OffseasonPage {
  view: OffseasonView | null;
  userId: string | null;
  isStaff: boolean;
  /** The viewer's own entry, when they have signed up. */
  ownEntry: OffseasonEntrant | null;
}

export async function loadOffseasonPage(): Promise<OffseasonPage> {
  const supabase = await createServerSupabase();
  const [{ data: userData }, tier, view] = await Promise.all([
    supabase.auth.getUser(),
    fetchStaffTier(supabase).catch(() => ({ isAdmin: false, isOwner: false })),
    loadOffseason(supabase),
  ]);
  const userId = userData.user?.id ?? null;
  return {
    view,
    userId,
    isStaff: tier.isAdmin || tier.isOwner,
    ownEntry: (userId && view?.entrants.find((entrant) => entrant.profile_id === userId)) || null,
  };
}
