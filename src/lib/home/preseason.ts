import type { Acquisition, LolRole } from "@/lib/draft/types";
import { createServerSupabase } from "@/lib/supabase/server";

export type PreseasonTeamSummary = {
  id: string;
  name: string;
  abbreviation: string;
  division: string | null;
  imageUrl: string | null;
  bannerColor: string;
  captainName: string;
  nominationPosition: number;
  pointsRemaining: number;
  budgetStart: number;
  rosterCount: number;
  draftedPlayers: PreseasonDraftedPlayer[];
};

export type PreseasonDraftedPlayer = {
  id: string;
  displayName: string;
  role: LolRole;
  rank: string | null;
  price: number | null;
  acquisition: Acquisition | null;
};

export type PreseasonPlayer = {
  id: string;
  displayName: string;
  role: LolRole;
  rank: string | null;
  opggUrl: string;
  price: number | null;
  available: boolean;
  lockLabel: string | null;
};

function normalizePlayerName(name: string): string {
  return name
    .normalize("NFKC")
    .trim()
    .replace(/^captain:\s*/i, "")
    .split("#")[0]
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export type PreseasonHomeData = {
  draftId: string | null;
  draftName: string | null;
  teams: PreseasonTeamSummary[];
  players: PreseasonPlayer[];
};

const EMPTY_DATA: PreseasonHomeData = {
  draftId: null,
  draftName: null,
  teams: [],
  players: [],
};

function lockLabel(acquisition: Acquisition | null, teamId: string | null): string | null {
  if (!teamId && !acquisition) return null;
  if (acquisition === "captain") return "Captain";
  if (acquisition === "free_agency") return "Free agency";
  return "Drafted";
}

export async function fetchPreseasonHomeData(): Promise<PreseasonHomeData> {
  const supabase = await createServerSupabase();
  const { data: settings, error: settingsError } = await supabase
    .from("league_settings")
    .select("featured_draft_id")
    .eq("id", 1)
    .single();

  if (settingsError && settingsError.code !== "PGRST116") throw settingsError;

  const draftId = (settings as { featured_draft_id?: string | null } | null)?.featured_draft_id ?? null;
  if (!draftId) return EMPTY_DATA;

  const [draftResult, teamsResult, playersResult, profilesResult, canonicalResult] = await Promise.all([
    supabase.from("drafts").select("id, name").eq("id", draftId).single(),
    supabase
      .from("teams")
      .select("id, name, abbreviation, division, image_url, banner_color, captain_profile_id, nomination_position, budget_start, points_remaining")
      .eq("draft_id", draftId)
      .order("nomination_position", { ascending: true }),
    supabase
      .from("players")
      .select("id, display_name, role, rank, opgg_url, team_id, price, acquisition, canonical_player_id")
      .eq("draft_id", draftId)
      .order("display_name", { ascending: true }),
    supabase.from("profiles").select("id, display_name"),
    supabase.from("player_pool").select("id, display_name, rank, opgg_url").eq("season_key", "season-5"),
  ]);

  if (teamsResult.error) throw teamsResult.error;
  if (playersResult.error) throw playersResult.error;

  const players = (playersResult.data ?? []) as Array<{
    id: string;
    display_name: string;
    role: LolRole;
    rank: string | null;
    opgg_url: string | null;
    team_id: string | null;
    price: number | null;
    acquisition: Acquisition | null;
    canonical_player_id?: string | null;
  }>;

  const profiles = ((profilesResult.data ?? []) as Array<{ id: string; display_name: string }>);
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile.display_name]));
  const canonicalPlayers = ((canonicalResult.data ?? []) as Array<{
    id: string;
    display_name: string;
    rank: string | null;
    opgg_url: string | null;
  }>);
  const canonicalById = new Map(canonicalPlayers.map((player) => [player.id, player]));
  const canonicalByName = new Map(canonicalPlayers.map((player) => [normalizePlayerName(player.display_name), player]));

  const playerMetadata = (player: (typeof players)[number]) =>
    (player.canonical_player_id ? canonicalById.get(player.canonical_player_id) : undefined) ??
    canonicalByName.get(normalizePlayerName(player.display_name));

  return {
    draftId,
    draftName: (draftResult.data as { name?: string } | null)?.name ?? null,
    teams: ((teamsResult.data ?? []) as Array<{
      id: string;
      name: string;
      abbreviation: string;
      division: string | null;
      image_url: string | null;
      banner_color: string | null;
      nomination_position: number;
      budget_start: number;
      points_remaining: number;
      captain_profile_id: string | null;
    }>).map((team) => ({
      id: team.id,
      name: team.name,
      abbreviation: team.abbreviation,
      division: team.division,
      imageUrl: team.image_url,
      bannerColor: team.banner_color ?? "#24324d",
      captainName:
        players.find((player) => player.team_id === team.id && player.acquisition === "captain")?.display_name ??
        profilesById.get(team.captain_profile_id ?? "") ??
        "Unassigned",
      nominationPosition: team.nomination_position,
      pointsRemaining: team.points_remaining,
      budgetStart: team.budget_start,
      rosterCount: players.filter((player) => player.team_id === team.id).length,
      draftedPlayers: players
        .filter((player) => player.team_id === team.id)
        .map((player) => ({
          id: player.id,
          displayName: player.display_name,
          role: player.role,
          rank: player.rank ?? playerMetadata(player)?.rank ?? null,
          price: player.price,
          acquisition: player.acquisition,
        })),
    })),
    players: players.map((player) => {
      const label = lockLabel(player.acquisition, player.team_id);
      return {
        id: player.id,
        displayName: player.display_name,
        role: player.role,
        rank: player.rank ?? playerMetadata(player)?.rank ?? null,
        opggUrl: player.opgg_url ?? playerMetadata(player)?.opgg_url ?? "#",
        price: player.price,
        available: label === null,
        lockLabel: label,
      };
    }),
  };
}
