import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchStaffTier, isMissingBroadcasterColumn } from "@/lib/auth/staffTier";
import type { Draft } from "@/lib/draft/types";
import DraftListClient from "@/components/admin/DraftListClient";
import AdminHomepageMode from "@/components/admin/AdminHomepageMode";
import AdminStaff, { type StaffProfile } from "@/components/admin/AdminStaff";
import AdminFeaturedMatchupEditor, { type FeaturedFixtureChoice } from "@/components/admin/AdminFeaturedMatchupEditor";
import AdminBangerTitles from "@/components/admin/AdminBangerTitles";
import type { HomepageMode } from "@/lib/home/seasonState";
import { fetchHomepageFeaturedSettings } from "@/lib/home/homepageSettings";
import { fetchBangerBoardSettings } from "@/lib/bangers/settings";
import { fetchHomepageSchedule } from "@/lib/home/schedule";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { filterAcademyFixtures } from "@/lib/academy/filtering";
import { academyTeamNames } from "@/lib/league/context";
import type { FixtureRow } from "@/lib/schedule/types";

function featuredFixtureChoices(fixtures: FixtureRow[]): FeaturedFixtureChoice[] {
  return fixtures.map((fixture) => ({
    id: fixture.id,
    label: `${fixture.division ?? fixture.stage} · ${fixture.team_a ?? "TBD"} vs ${fixture.team_b ?? "TBD"}`,
  }));
}

async function fetchStaffProfiles(supabase: Awaited<ReturnType<typeof createServerSupabase>>) {
  const current = await supabase
    .from("profiles")
    .select("id, display_name, is_admin, is_owner, is_broadcaster")
    .order("display_name");
  if (!current.error) return (current.data as StaffProfile[]) ?? [];
  if (!isMissingBroadcasterColumn(current.error)) return [];

  const legacy = await supabase
    .from("profiles")
    .select("id, display_name, is_admin, is_owner")
    .order("display_name");
  if (legacy.error) return [];
  return ((legacy.data as Omit<StaffProfile, "is_broadcaster">[]) ?? []).map((profile) => ({
    ...profile,
    is_broadcaster: false,
  }));
}

/**
 * Admin hub: the league's controls are spread across their feature pages
 * (fixtures + season/phase on Schedule, signups on Sign Up, avg bids on
 * Players, rosters on Teams) — this page gives staff one place with live
 * counts and jump links, plus the draft manager that always lived here.
 */
export default async function AdminPage() {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner, isBroadcaster } = await fetchStaffTier(supabase);
  const canUseFullAdmin = isAdmin || isOwner;
  if (!canUseFullAdmin && !isBroadcaster) redirect("/");

  // Owners see the staff panel. This gate is presentation only — set_profile_admin
  // re-checks ownership server-side, so an admin who forges their way here can
  // still change nothing.
  const staffProfiles = isOwner
    ? await fetchStaffProfiles(supabase)
    : [];

  const [draftsResult, settingsResult, signupCountResult, fixtureCountResult] = await Promise.all([
    supabase.from("drafts").select("*").order("created_at", { ascending: false }),
    supabase
      .from("league_settings")
      .select("current_season, current_phase, signups_open, homepage_mode")
      .eq("id", 1)
      .single(),
    supabase.from("signups").select("*", { count: "exact", head: true }),
    supabase.from("fixtures").select("*", { count: "exact", head: true }),
  ]);

  const drafts = (draftsResult.data as Draft[]) ?? [];
  const settings = settingsResult.data as {
    current_season: string;
    current_phase: string;
    signups_open: boolean;
    homepage_mode: HomepageMode;
  } | null;
  const signupCount = signupCountResult.count ?? 0;
  const fixtureCount = fixtureCountResult.count ?? 0;

  const [academyDraftData, premierSettings, academySettings, bangerTitles] = await Promise.all([
    fetchAcademyDraftData(supabase),
    fetchHomepageFeaturedSettings("premier"),
    fetchHomepageFeaturedSettings("academy"),
    fetchBangerBoardSettings(),
  ]);
  const academyTeamNameSet = academyTeamNames(academyDraftData.teams);
  const [premierSchedule, academySchedule] = await Promise.all([
    fetchHomepageSchedule(),
    fetchHomepageSchedule((fixtures) => filterAcademyFixtures(fixtures, academyTeamNameSet)),
  ]);

  const cards = [
    {
      label: "Signups",
      stat: `${signupCount} total · ${settings?.signups_open ? "OPEN" : "CLOSED"}`,
      statTone: settings?.signups_open ? "text-mint" : "text-red-400",
      description: "Review the pool, open/close the window.",
      href: "/signup",
    },
    {
      label: "Schedule",
      stat: `${fixtureCount} fixtures · ${settings?.current_season ?? "—"} ${settings?.current_phase ?? ""}`,
      statTone: "text-gold",
      description: "Edit fixtures, scores, and the current season/phase.",
      href: "/schedule",
    },
    {
      label: "Players",
      stat: "Pool & avg bids",
      statTone: "text-gold",
      description: "Edit the player pool and free-agency average bids.",
      href: "/players",
    },
    {
      label: "Teams",
      stat: "Rosters & identity",
      statTone: "text-gold",
      description: "Edit team names, logos, captains, and roster swaps.",
      href: "/teams",
    },
    {
      label: "Betting",
      stat: "Markets, pick'ems & catalog",
      statTone: "text-gold",
      description: "Create/resolve markets and pick'ems, manage the catalog, seasons, and balances.",
      href: "/admin/betting",
    },
  ] as const;

  return (
    <main className="bg-hash mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-16">
      <header>
        <span className="label-dash">STAFF ONLY</span>
        <h1 className="type-display mt-3 text-4xl sm:text-5xl">Admin</h1>
      </header>

      {canUseFullAdmin && <section aria-label="League controls" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="card-brand group flex flex-col gap-1.5 p-5 transition hover:border-coral"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="type-display text-2xl group-hover:text-coral">{card.label}</span>
              <span className={`text-xs font-bold uppercase tracking-wide ${card.statTone}`}>
                {card.stat}
              </span>
            </div>
            <p className="text-sm text-steel">{card.description}</p>
          </Link>
        ))}
      </section>}

      <section aria-labelledby="homepage-control-title" className="flex flex-col gap-3">
        <h2 id="homepage-control-title" className="type-display text-2xl">Homepage</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AdminFeaturedMatchupEditor
            homepage="premier"
            fixtures={featuredFixtureChoices(premierSchedule.fixtures)}
            settings={premierSettings}
          />
          <AdminFeaturedMatchupEditor
            homepage="academy"
            fixtures={featuredFixtureChoices(academySchedule.fixtures)}
            settings={academySettings}
          />
        </div>
        {isOwner ? (
          <AdminHomepageMode homepageMode={settings?.homepage_mode ?? "auto"} />
        ) : (
          <p className="text-sm text-steel">Some league configuration is owner-only.</p>
        )}
      </section>

      {canUseFullAdmin && <section aria-labelledby="banger-control-title" className="flex flex-col gap-3">
        <h2 id="banger-control-title" className="type-display text-2xl">Banger Board</h2>
        <AdminBangerTitles initial={bangerTitles} />
      </section>}

      {canUseFullAdmin && <section aria-label="Drafts" className="flex flex-col gap-4">
        <h2 className="type-display text-2xl">Drafts</h2>
        {isOwner ? (
          <DraftListClient initialDrafts={drafts} />
        ) : (
          <p className="text-sm text-steel">Some league configuration is owner-only.</p>
        )}
      </section>}

      {isOwner && <AdminStaff profiles={staffProfiles} />}
    </main>
  );
}
