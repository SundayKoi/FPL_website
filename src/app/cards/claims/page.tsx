import { redirect } from "next/navigation";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Keep old "claim your card" bookmarks working. A player following one
 * used to land on the admin moderation queue; they wanted their own claim,
 * which lives on the cards hub. Staff still go to the queue.
 */
export default async function LegacyCardClaimsPage() {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  redirect(isAdmin || isOwner ? "/admin/claims" : "/cards#claim");
}
