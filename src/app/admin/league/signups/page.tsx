import { redirect } from "next/navigation";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminSignupsTable from "@/components/signup/AdminSignupsTable";
import AdminSignupsToggle from "@/components/signup/AdminSignupsToggle";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createServerSupabase } from "@/lib/supabase/server";
import type { SignupRow } from "@/lib/signup/types";

export const metadata = { title: "Signups — FPL Admin" };

export default async function AdminSignupsPage() {
  const supabase = await createServerSupabase();
  const { isAdmin } = await fetchStaffTier(supabase);
  if (!isAdmin) redirect("/admin");

  const [settingsResult, signupsResult] = await Promise.all([
    supabase.from("league_settings").select("current_season, signups_open").eq("id", 1).single(),
    supabase.from("signups").select("*").order("created_at", { ascending: false }),
  ]);
  const settings = settingsResult.data as { current_season?: string | null; signups_open?: boolean | null } | null;

  return (
    <main className="page-backdrop mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 text-content sm:px-6 lg:px-8">
      <AdminSectionHeader
        title="Signups"
        description="Manage the site-wide Premier signup window and review submitted applications. The signup window and submissions are enforced by the database."
      />
      {settingsResult.error ? (
        <p className="card-brand p-4 text-sm text-red-300" role="alert">Signup settings are unavailable right now.</p>
      ) : (
        <AdminSignupsToggle signupsOpen={settings?.signups_open ?? false} />
      )}
      {signupsResult.error ? (
        <p className="card-brand p-4 text-sm text-red-300" role="alert">Signup submissions could not be loaded.</p>
      ) : (
        <AdminSignupsTable signups={(signupsResult.data as SignupRow[] | null) ?? []} />
      )}
      <p className="text-xs text-muted">Current signup season: {settings?.current_season ?? "unavailable"}. All seasons are included in the table and can be filtered there.</p>
    </main>
  );
}
