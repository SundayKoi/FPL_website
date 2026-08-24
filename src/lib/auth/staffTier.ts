import type { SupabaseClient } from "@supabase/supabase-js";

export interface StaffTier {
  isAdmin: boolean;
  isOwner: boolean;
  isBroadcaster: boolean;
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
  if (error || !data) return { isAdmin: false, isOwner: false, isBroadcaster: false };
  return {
    isAdmin: Boolean(data.is_admin),
    isOwner: Boolean(data.is_owner),
    isBroadcaster: Boolean(data.is_broadcaster),
  };
}
