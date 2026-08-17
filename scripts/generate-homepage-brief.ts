/**
 * Weekly homepage write-up, for either league.
 *
 * Every number is computed here from the database. The model is asked only to
 * write prose around facts it is handed, and told to omit anything it cannot
 * support, so a confident-sounding wrong scoreline is not something it can
 * produce. Generated text then goes through stripAiTells before it is stored.
 *
 * Run: npx tsx scripts/generate-homepage-brief.ts [--league premier|academy]
 * Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY.
 *
 * The two leagues share every table and are separated by season code
 * (league_settings.current_season vs academy_season), so the Academy run
 * additionally narrows fixtures and stat lines to the Academy draft's teams.
 */
import { createClient } from "@supabase/supabase-js";
import { cleanBrief } from "../src/lib/home/brief";

const MODEL = "claude-sonnet-5";
const WEEK_STAGES = ["week_1", "week_2", "week_3", "week_4", "week_5"] as const;

const LEAGUES = ["premier", "academy"] as const;
type League = (typeof LEAGUES)[number];

function parseLeague(argv: string[]): League {
  const index = argv.indexOf("--league");
  if (index === -1) return "premier";
  const value = argv[index + 1];
  if (!LEAGUES.includes(value as League)) {
    throw new Error(`--league must be one of ${LEAGUES.join(", ")} (got ${value ?? "nothing"})`);
  }
  return value as League;
}

const league = parseLeague(process.argv.slice(2));

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!url || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

/** The Academy draft's team names, used to narrow fixtures and stat lines. */
async function academyTeamNames(draftId: string | null | undefined): Promise<string[]> {
  if (!draftId) return [];
  const { data } = await db.from("teams").select("name").eq("draft_id", draftId);
  return ((data as { name: string }[] | null) ?? []).map((team) => team.name);
}

interface Fixture {
  id: string; season: string; stage: string; division: string | null;
  team_a: string | null; team_b: string | null;
  score_a: number | null; score_b: number | null; scheduled_at: string | null;
}

const stageNumber = (stage: string) => WEEK_STAGES.indexOf(stage as (typeof WEEK_STAGES)[number]) + 1;

async function main() {
  const { data: settings } = await db
    .from("league_settings")
    .select("current_season, academy_season, academy_draft_id")
    .eq("id", 1)
    .single();
  const settingsRow = settings as
    | { current_season?: string; academy_season?: string; academy_draft_id?: string | null }
    | null;
  const season = league === "academy" ? settingsRow?.academy_season : settingsRow?.current_season;
  if (!season) {
    throw new Error(
      league === "academy"
        ? "league_settings.academy_season is not set"
        : "league_settings.current_season is not set",
    );
  }

  const teamNames = league === "academy" ? await academyTeamNames(settingsRow?.academy_draft_id) : [];
  if (league === "academy" && teamNames.length === 0) {
    console.log("No Academy teams are configured (league_settings.academy_draft_id); nothing to write about.");
    return;
  }
  const inLeague = (name: string | null) =>
    league !== "academy" ||
    teamNames.some((team) => team.trim().toLowerCase() === (name ?? "").trim().toLowerCase());

  const { data: fixtureRows } = await db
    .from("fixtures")
    .select("id, season, stage, division, team_a, team_b, score_a, score_b, scheduled_at")
    .eq("season", season)
    .in("stage", WEEK_STAGES as unknown as string[]);
  // Season code alone already separates the leagues; the team check is the
  // same belt-and-braces filter the Academy pages apply.
  const fixtures = ((fixtureRows as Fixture[]) ?? []).filter(
    (f) => inLeague(f.team_a) || inLeague(f.team_b),
  );

  const played = fixtures.filter((f) => f.score_a !== null && f.score_b !== null);
  if (played.length === 0) {
    console.log(`No completed ${league} games in ${season} yet; nothing to write about.`);
    return;
  }

  // The most recent week with results is the one to recap; the next week up is
  // the one to preview.
  const latestWeek = Math.max(...played.map((f) => stageNumber(f.stage)));
  const recapFixtures = played.filter((f) => stageNumber(f.stage) === latestWeek);
  const previewFixtures = fixtures.filter(
    (f) => stageNumber(f.stage) === latestWeek + 1 && f.score_a === null
  );

  // Standings from completed series across the season.
  const record: Record<string, { w: number; l: number; division: string | null }> = {};
  for (const f of played) {
    if (!f.team_a || !f.team_b) continue;
    record[f.team_a] ??= { w: 0, l: 0, division: f.division };
    record[f.team_b] ??= { w: 0, l: 0, division: f.division };
    const aWon = (f.score_a ?? 0) > (f.score_b ?? 0);
    record[aWon ? f.team_a : f.team_b].w += 1;
    record[aWon ? f.team_b : f.team_a].l += 1;
  }

  // Stat leaders for the recapped week, straight from the ingest.
  const since = recapFixtures
    .map((f) => f.scheduled_at)
    .filter((d): d is string => !!d)
    .sort()[0];
  let statQuery = db
    .from("raw_stats")
    .select("summoner_name, team_name, champion, kills, deaths, assists, total_damage_to_champions, cs_per_min, vision_score, game_date")
    .eq("season", season)
    .gte("game_date", since ?? "1970-01-01")
    .limit(500);
  if (teamNames.length) statQuery = statQuery.in("team_name", teamNames);
  const { data: statRows } = await statQuery;

  const facts = {
    season,
    week_just_played: latestWeek,
    results: recapFixtures.map((f) => ({
      division: f.division,
      [`${f.team_a}`]: f.score_a,
      [`${f.team_b}`]: f.score_b,
    })),
    next_week: {
      week: latestWeek + 1,
      fixtures: previewFixtures.map((f) => ({
        division: f.division, team_a: f.team_a, team_b: f.team_b, kickoff: f.scheduled_at,
      })),
    },
    standings: Object.entries(record)
      .map(([team, r]) => ({ team, wins: r.w, losses: r.l, division: r.division }))
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses),
    player_lines: (statRows ?? []).slice(0, 120),
  };

  const system = [
    league === "academy"
      ? "You write the weekly front-page copy for the Franchise Academy League, the development tier of the Franchise Premier League, an amateur League of Legends draft league. This is the Academy's first ever season, so there is no prior history to refer back to."
      : "You write the weekly front-page copy for the Franchise Premier League, an amateur League of Legends draft league.",
    "Voice: confident esports desk. Short punchy sentences. Concrete over abstract. Name teams and players. Dry humour is welcome, hype for its own sake is not.",
    "",
    "Hard rules:",
    "1. Use ONLY the facts in the JSON provided. Never invent a score, a name, a streak or a statistic. If you cannot support a claim from the data, leave it out.",
    "2. Never use an em dash or en dash. Use commas, full stops or brackets.",
    "3. Banned phrasing: 'a testament to', 'when it comes to', 'it is worth noting', 'in the world of', 'boasts', 'delve', 'game-changer', 'unleash', 'elevate', 'at the end of the day', 'needless to say', 'one thing is clear', and any 'not just X, but Y' construction.",
    "4. No preamble, no sign-off, no headings. Return only the JSON object asked for.",
    "5. Every section is plain prose. 2 to 4 sentences each, except league_notes which may be up to 5.",
    "",
    "Return exactly this JSON shape and nothing else:",
    '{"recap": string, "preview": string, "players_note": string, "teams_note": string, "league_notes": string}',
    "",
    "recap: what happened in the week just played.",
    "preview: what is coming next week and what hangs on it.",
    "players_note: the individual performances worth naming this week.",
    "teams_note: which franchises are trending up or down and why.",
    "league_notes: streaks, milestones and storylines worth watching.",
  ].join("\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: JSON.stringify(facts) }],
    }),
  });

  if (!response.ok) {
    // Leaving last week's brief published is better than replacing it with an
    // error, so fail loudly and change nothing.
    throw new Error(`Anthropic API ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as { content: { type: string; text?: string }[] };
  const text = payload.content.find((c) => c.type === "text")?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Model did not return JSON: ${text.slice(0, 400)}`);

  const sections = cleanBrief(JSON.parse(jsonMatch[0]) as Record<string, string>);

  const { error } = await db.from("homepage_briefs").insert({
    league,
    season,
    week: latestWeek,
    recap: sections.recap ?? null,
    preview: sections.preview ?? null,
    players_note: sections.players_note ?? null,
    teams_note: sections.teams_note ?? null,
    league_notes: sections.league_notes ?? null,
    model: MODEL,
    published: true,
  });
  if (error) throw new Error(`Insert failed: ${error.message}`);

  console.log(`Published ${league} brief for ${season} week ${latestWeek}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
