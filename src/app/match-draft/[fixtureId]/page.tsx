import Link from "next/link";
import MatchDraftBoard from "@/components/match-draft/MatchDraftBoard";
import { fearlessBlockedChampions } from "@/lib/match-draft/rules";
import type { MatchDraftAction, MatchDraftLayout, MatchDraftRow, MatchDraftState } from "@/lib/match-draft/types";
import type { FixtureRow } from "@/lib/schedule/types";
import { createServerSupabase } from "@/lib/supabase/server";
import type { TeamIdentity } from "@/lib/teams/identity";
import { teamSlug } from "@/lib/teams/teamPage";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function gameParam(value: string | undefined, bestOf: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, bestOf);
}

function layoutParam(value: string | undefined): MatchDraftLayout {
  return value === "board" ? "board" : "stage";
}

function fallbackIdentity(name: string | null, side: "Blue" | "Red"): TeamIdentity {
  const label = name?.trim() || `${side} side`;
  return {
    name: label,
    abbreviation: label === `${side} side` ? side.slice(0, 3).toUpperCase() : label.slice(0, 3).toUpperCase(),
    imageUrl: null,
  };
}

function stateFor({
  fixture,
  row,
  rows,
  gameNumber,
  layout,
  identities,
}: {
  fixture: FixtureRow;
  row: MatchDraftRow | null;
  rows: MatchDraftRow[];
  gameNumber: number;
  layout: MatchDraftLayout;
  identities: Record<string, TeamIdentity>;
}): MatchDraftState {
  const actions = row?.actions ?? [];
  const prior = rows.map((draft) => ({ gameNumber: draft.game_number, actions: draft.actions ?? [] }));
  return {
    fixtureId: fixture.id,
    gameNumber,
    status: row?.status ?? "drafting",
    layout: row?.layout ?? layout,
    currentStepIndex: row?.current_step_index ?? 0,
    turnStartedAt: row?.turn_started_at ?? null,
    blueTeam: identities[teamSlug(fixture.team_a ?? "")] ?? fallbackIdentity(fixture.team_a, "Blue"),
    redTeam: identities[teamSlug(fixture.team_b ?? "")] ?? fallbackIdentity(fixture.team_b, "Red"),
    actions: actions.filter((action): action is MatchDraftAction => Boolean(action?.champion)),
    blockedChampions: [...fearlessBlockedChampions(prior, gameNumber)],
  };
}

export default async function MatchDraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ fixtureId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { fixtureId } = await params;
  const query = await searchParams;
  const supabase = await createServerSupabase();

  const { data: fixtureData } = await supabase.from("fixtures").select("*").eq("id", fixtureId).single();
  const fixture = fixtureData as FixtureRow | null;
  if (!fixture) {
    return (
      <main className="flex flex-1 items-center justify-center bg-hash p-8">
        <section className="card-brand max-w-md p-6 text-center">
          <h1 className="type-display text-2xl text-white">Match not found</h1>
          <p className="mt-2 text-sm text-steel">This draft link does not match a scheduled fixture.</p>
          <Link href="/captain" className="btn-pill mt-4 inline-block px-4 py-2 text-sm">Back to captain</Link>
        </section>
      </main>
    );
  }

  const gameNumber = gameParam(firstParam(query.game), fixture.best_of);
  const layout = layoutParam(firstParam(query.layout));
  const teamNames = [fixture.team_a, fixture.team_b].filter((name): name is string => Boolean(name?.trim()));
  const [draftRowsResult, identitiesResult] = await Promise.all([
    supabase.from("match_drafts").select("*").eq("fixture_id", fixture.id).order("game_number"),
    teamNames.length
      ? supabase.from("teams").select("name, abbreviation, image_url").in("name", teamNames)
      : Promise.resolve({ data: [] }),
  ]);

  const rows = (draftRowsResult.data as MatchDraftRow[]) ?? [];
  const identities: Record<string, TeamIdentity> = {};
  for (const team of (identitiesResult.data as { name: string; abbreviation: string | null; image_url: string | null }[]) ?? []) {
    identities[teamSlug(team.name)] = {
      name: team.name,
      abbreviation: team.abbreviation || team.name.slice(0, 3).toUpperCase(),
      imageUrl: team.image_url,
    };
  }
  const row = rows.find((draft) => draft.game_number === gameNumber) ?? null;

  return <MatchDraftBoard initialState={stateFor({ fixture, row, rows, gameNumber, layout, identities })} />;
}
