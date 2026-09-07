import type { Metadata } from "next";
import DraftDirectory from "@/components/draft/DraftDirectory";
import type { Draft } from "@/lib/draft/types";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Auction Draft — FPL",
};

export default async function DraftPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("drafts")
    .select("*")
    .order("created_at", { ascending: false });
  const drafts = (data as Draft[]) ?? [];
  const staff = await fetchStaffTier(supabase).catch(() => ({ isAdmin: false, isOwner: false, isBroadcaster: false }));

  return <DraftDirectory drafts={drafts} showAdmin={staff.isAdmin || staff.isOwner} />;
}
