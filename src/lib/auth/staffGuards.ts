import { createServerSupabase } from "@/lib/supabase/server";
import { fetchStaffTier } from "@/lib/auth/staffTier";

/** Whether the signed-in caller is a site owner: the check owner-only
 *  server actions make before they touch the service-role client. */
export async function requireOwner(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { isOwner } = await fetchStaffTier(supabase);
  return isOwner;
}
