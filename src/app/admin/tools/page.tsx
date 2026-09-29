import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminConsole from "@/components/admin/AdminConsole";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { resolveAdminLeagueSeason } from "@/lib/admin/scope";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "All tools — FPL Admin",
};

export default async function AdminToolsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin && !isOwner) redirect("/admin");

  const params = await searchParams;
  const context = await resolveAdminLeagueSeason(supabase, params);
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "America/Chicago",
  }).format(new Date()).toUpperCase();
  const query = Array.isArray(params.q) ? params.q[0] : params.q;

  return (
    <AdminConsole
      view="tools"
      isOwner={isOwner}
      isFullAdmin
      league={context.league}
      season={context.season}
      defaultSeasons={context.defaultSeasons}
      seasonOptions={context.seasonOptions}
      phase="Tool directory"
      upcomingCount={0}
      signupsOpen={false}
      homepageMode="auto"
      featuredMatch={null}
      upcoming={[]}
      today={today}
      initialQuery={query ?? ""}
    />
  );
}
