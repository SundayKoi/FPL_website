import type { Metadata } from "next";
import Link from "next/link";
import LockIn from "@/components/offseason/LockIn";
import OffseasonSignupForm from "@/components/offseason/SignupForm";
import { Empty, OffseasonShell, Panel } from "@/components/offseason/ui";
import { claimableSpots, lockInOpen } from "@/lib/offseason/lockIn";
import { loadOffseasonPage } from "@/lib/offseason/page";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Offseason Sign-up — FPL",
};

export default async function OffseasonSignupPage() {
  const { view, userId, isStaff, ownEntry } = await loadOffseasonPage();
  const shell = (children: ReactNode) => (
    <OffseasonShell
      eyebrow={view?.event.name ?? "FPL Offseason"}
      title="Sign up"
      active="signup"
      isStaff={isStaff}
      description="One pool for every rank, Premier and Academy alike. Pick the role you want and a secondary you would play; roles are filled first come, first served."
    >
      {children}
    </OffseasonShell>
  );

  if (!view) return shell(<Panel title="Not open yet"><Empty>The offseason tournament has not been set up yet.</Empty></Panel>);

  if (!userId) {
    return shell(
      <Panel title="Sign in first">
        <p className="text-sm text-muted">Sign in with Discord so captains can find you in the draft room.</p>
        <Link href="/login?redirect=/offseason/signup" className="btn-pill self-start text-sm">
          Sign in
        </Link>
      </Panel>,
    );
  }

  const lockIn = lockInOpen(view.event, view.entrants, ownEntry) ? (
    <LockIn eventId={view.event.id} signedIn entry={ownEntry} spots={claimableSpots(view.entrants)} />
  ) : null;

  if (!view.event.signups_open) {
    return shell(
      <>
        {lockIn}
        <Panel title="Sign-ups are closed">
          <p className="text-sm text-muted">
            {ownEntry && ownEntry.status !== "withdrawn"
              ? `You're signed up as ${ownEntry.display_name} (${ownEntry.riot_id}). Ask staff if anything needs changing.`
              : "Ask staff in Discord if you still want in."}
          </p>
        </Panel>
      </>,
    );
  }

  const supabase = await createServerSupabase();
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();

  return shell(
    <>
      {lockIn}
      <OffseasonSignupForm
        eventId={view.event.id}
        entry={ownEntry}
        defaultName={(profile as { display_name?: string | null } | null)?.display_name ?? ""}
      />
    </>,
  );
}
