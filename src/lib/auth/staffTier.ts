import type { SupabaseClient } from "@supabase/supabase-js";

export interface StaffTier {
  isAdmin: boolean;
  isOwner: boolean;
  isBroadcaster: boolean;
}

export function canAccessBroadcaster(
  tier: Pick<StaffTier, "isOwner" | "isBroadcaster">,
): boolean {
  return tier.isOwner || tier.isBroadcaster;
}

export function isMissingBroadcasterColumn(error: { code?: string; message?: string } | null) {
  return (
    (error?.code === "PGRST204" || error?.code === "42703") &&
    error.message?.includes("is_broadcaster")
  );
}

/** Both staff flags for the signed-in visitor, read server-side. Fails closed:
 *  any error yields no access rather than defaulting open. Presentation only —
 *  the database policies are the real gate. */
export async function fetchStaffTier(supabase: SupabaseClient): Promise<StaffTier> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { isAdmin: false, isOwner: false, isBroadcaster: false };
  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin, is_owner, is_broadcaster")
    .eq("id", userData.user.id)
    .single();
  if (error || !data) {
    if (!isMissingBroadcasterColumn(error)) {
      return { isAdmin: false, isOwner: false, isBroadcaster: false };
    }

    const legacyProfile = await supabase
      .from("profiles")
      .select("is_admin, is_owner")
      .eq("id", userData.user.id)
      .single();
    if (legacyProfile.error || !legacyProfile.data) {
      return { isAdmin: false, isOwner: false, isBroadcaster: false };
    }
    return {
      isAdmin: Boolean(legacyProfile.data.is_admin),
      isOwner: Boolean(legacyProfile.data.is_owner),
      isBroadcaster: false,
    };
  }
  return {
    isAdmin: Boolean(data.is_admin),
    isOwner: Boolean(data.is_owner),
    isBroadcaster: Boolean(data.is_broadcaster),
  };
}
