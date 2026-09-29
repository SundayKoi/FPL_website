import type { Metadata } from "next";
import Link from "next/link";
import AboutPageHeader from "@/components/info/AboutPageHeader";
import AboutPageShell from "@/components/info/AboutPageShell";
import { createServerSupabase } from "@/lib/supabase/server";
import SignupForm from "@/components/signup/SignupForm";

export const metadata: Metadata = {
  title: "Sign Up — FPL",
};

export default async function SignupPage() {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  let isAdmin = false;
  let discordName = "";

  if (userData.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin, display_name")
      .eq("id", userData.user.id)
      .single();
    isAdmin = profile?.is_admin ?? false;
    // Discord OAuth fills display_name with the Discord username — prefill
    // the form for signed-in players.
    discordName = profile?.display_name ?? "";
  }

  const settingsResult = await supabase
    .from("league_settings")
    .select("current_season, signups_open")
    .eq("id", 1)
    .single();

  const season = settingsResult.data?.current_season ?? "S5";
  const signupsOpen = settingsResult.data?.signups_open ?? true;

  return (
    <AboutPageShell activeHref="/info">
      <AboutPageHeader
        eyebrow="Join the league"
        title="Sign up"
        description={
          <>
            Enter the {season} Premier player pool. Eligibility rules — including ranked-game minimums, account level,
            and the rank cap — are in the <Link href="/rulebook#league-overview" className="text-action-text underline underline-offset-4 hover:text-white">official rules</Link>;
            read them before you submit.
          </>
        }
      />

      {isAdmin ? (
        <section aria-label="Signup administration" className="mb-6 border-y border-border-subtle py-4">
          <Link href="/admin/league/signups" className="text-sm font-semibold text-action-text underline underline-offset-4">Manage signups in Admin →</Link>
        </section>
      ) : null}

      {signupsOpen ? (
        <SignupForm season={season} initialDiscord={discordName} />
      ) : (
        <div className="max-w-3xl border-y border-border-subtle py-8">
          <p className="font-display text-2xl font-semibold text-white">Signups are closed</p>
          <p className="mt-3 text-sm leading-6 text-muted">
            The {season} signup window isn&apos;t open right now. Follow Discord for the next split&apos;s announcement.
          </p>
        </div>
      )}
    </AboutPageShell>
  );
}
