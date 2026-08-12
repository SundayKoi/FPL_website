import { createServerSupabase } from "@/lib/supabase/server";
import type { SignupRow } from "@/lib/signup/types";
import AdminSignupsTable from "@/components/signup/AdminSignupsTable";
import SignupForm from "@/components/signup/SignupForm";

export default async function SignupPage() {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  let isAdmin = false;

  if (userData.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userData.user.id)
      .single();
    isAdmin = profile?.is_admin ?? false;
  }

  const [settingsResult, signupsResult] = await Promise.all([
    supabase.from("league_settings").select("current_season").eq("id", 1).single(),
    // RLS hides rows from non-admins anyway; skipping the query avoids the
    // noise of a permission-shaped empty result.
    isAdmin
      ? supabase.from("signups").select("*").order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),
  ]);

  const season = settingsResult.data?.current_season ?? "S5";
  const signups = (signupsResult.data as SignupRow[]) ?? [];

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="border-b border-line pb-8">
          <span className="label-dash">JOIN THE LEAGUE</span>
          <h1 className="type-display mt-3 text-5xl sm:text-6xl">Sign Up</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-steel">
            Enter the {season} player pool. Check the Info page for eligibility rules —
            ranked-game minimums, account level, and the rank cap — before you submit.
          </p>
        </header>

        {isAdmin && (
          <div className="mt-8">
            <AdminSignupsTable signups={signups} />
          </div>
        )}

        <div className="mt-8">
          <SignupForm season={season} />
        </div>
      </div>
    </main>
  );
}
