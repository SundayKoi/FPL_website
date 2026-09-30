import type { Metadata } from "next";
import { redirect } from "next/navigation";
import EntrantsAdmin from "@/components/offseason/admin/EntrantsAdmin";
import EventSettings, { CreateEventForm } from "@/components/offseason/admin/EventSettings";
import WeeksAdmin from "@/components/offseason/admin/WeeksAdmin";
import type { OffseasonAdminData } from "@/components/offseason/admin/shared";
import { OffseasonShell, Panel } from "@/components/offseason/ui";
import type { DraftStatus } from "@/lib/draft/types";
import { loadOffseasonPage } from "@/lib/offseason/page";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Offseason Admin — FPL",
  robots: { index: false, follow: false },
};

/** The offseason's control room. Staff only; the database checks every write again. */
export default async function OffseasonAdminPage() {
  const { view, userId, isStaff } = await loadOffseasonPage();
  if (!userId) redirect("/login?redirect=/offseason/admin");
  if (!isStaff) redirect("/offseason");

  if (!view) {
    return (
      <OffseasonShell title="Offseason admin" active="admin" isStaff>
        <Panel title="Create the event">
          <CreateEventForm />
        </Panel>
      </OffseasonShell>
    );
  }

  const draftIds = view.weeks.flatMap((week) => [week.main_draft_id, week.elimination_draft_id]).filter((id): id is string => Boolean(id));
  const drafts: OffseasonAdminData["drafts"] = {};
  if (draftIds.length > 0) {
    const supabase = await createServerSupabase();
    const { data: rows } = await supabase.from("drafts").select("id, name, status").in("id", draftIds);
    for (const row of (rows ?? []) as { id: string; name: string; status: DraftStatus }[]) {
      drafts[row.id] = { name: row.name, status: row.status };
    }
  }

  const data: OffseasonAdminData = {
    event: view.event,
    entrants: view.entrants,
    weeks: view.weeks,
    entries: view.entries,
    teams: view.teams,
    members: view.members,
    matches: view.matches,
    games: view.games,
    ratings: Object.fromEntries(
      [...view.ratings].map(([id, rating]) => [id, { overall: rating.overall, games: rating.games, wins: rating.wins, losses: rating.losses }]),
    ),
    drafts,
  };

  return (
    <OffseasonShell
      eyebrow={view.event.name}
      title="Offseason admin"
      active="admin"
      isStaff
      description="Sign-ups, roles, weekly tiers and captains, the auctions, results and eliminations. Weekly drafts run in the ordinary draft room; everything else lives here."
    >
      <Panel title="Event">
        <EventSettings event={view.event} />
      </Panel>
      <Panel title="Players" aside={`${view.entrants.length} sign-ups, in sign-up order`}>
        <EntrantsAdmin data={data} />
      </Panel>
      <Panel title="Weeks">
        <WeeksAdmin data={data} />
      </Panel>
    </OffseasonShell>
  );
}
