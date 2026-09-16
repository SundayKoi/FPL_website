import { SEASON_AWARDS, type AwardDefinition } from "./catalog";
import championMap from "./champion-map.json";
import { seasonBelongsToLeague, type LeagueSeasons } from "@/lib/league/season";
import { DIVISIONS, type Division, type FixtureRow } from "@/lib/schedule/types";
import { cardPlayerKey } from "@/lib/cards/build";
import { assignChampions } from "@/lib/cards/seasonsEnd/assignment";
import { championDisplayName } from "@/lib/match-draft/champions";

/** Raw storage fields stay nullable. Missing observations must never become zero. */
export interface SeasonRow {
  [field: string]: string | number | boolean | null | undefined;
  match_id: string;
  summoner_name: string;
  tag: string;
  season: string;
  season_phase: string;
  team_name: string;
  division?: Division | null;
  team_side: string;
  role: string;
  game_date: string;
  champion: string;
  win: boolean;
}
export interface AwardWinner {
  name: string;
  team: string;
  value: number;
  games: number;
  total?: number;
  perGame?: number;
  detail?: string;
  division?: Division;
  champion?: string;
  championGames?: number;
  playerKeys?: string[];
  title?: string;
}
export type AwardStatus = "ready" | "unavailable" | "unearned";
export interface DivisionAwardStatus {
  status: AwardStatus;
  note?: string;
}
export interface SeasonAward extends AwardDefinition {
  winners: AwardWinner[];
  status: AwardStatus;
  note?: string;
  divisionStatuses?: Record<Division, DivisionAwardStatus>;
}
export interface SeasonEndResult {
  awards: SeasonAward[];
  games: number;
  players: number;
  minGames: number;
  complete: boolean;
  warnings: string[];
}
type Group = { name: string; team: string; rows: SeasonRow[] };
type DeriveOptions = {
  division?: Division;
};
const identity = (r: SeasonRow) => `${r.summoner_name}#${r.tag}`;
const playerKey = (r: SeasonRow) => cardPlayerKey(r.summoner_name, r.tag);
const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const teamKey = (s: string) => s.trim().toLowerCase();
const number = (r: SeasonRow, key: string): number | null => {
  const v = r[key];
  return typeof v === "number" && Number.isFinite(v) ? v : typeof v === "boolean" ? Number(v) : null;
};
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const mean = (values: number[]) => sum(values) / values.length;
const all = (rows: SeasonRow[], field: string): number[] | null => {
  const values = rows.map(r => number(r, field));
  return values.some(v => v === null) ? null : values as number[];
};
function groups(rows: SeasonRow[], key: (r: SeasonRow) => string): SeasonRow[][] {
  const map = new Map<string, SeasonRow[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return [...map.values()];
}
function longest(values: boolean[]): number {
  let best = 0, run = 0;
  for (const v of values) { run = v ? run + 1 : 0; best = Math.max(best, run); }
  return best;
}
const mappedChampions = new Map(Object.entries(championMap).flatMap(([id, c]) => [[normalized(id), c], [normalized(c.name), c]] as const));
export function championCategories(champion: string, kind: "regions" | "classes"): string[] | null {
  return mappedChampions.get(normalized(champion))?.[kind] ?? null;
}
function completeFixture(f: FixtureRow): boolean {
  return f.score_a !== null && f.score_b !== null && f.score_a !== f.score_b &&
    Math.max(f.score_a, f.score_b) === Math.ceil(f.best_of / 2) &&
    Math.min(f.score_a, f.score_b) >= 0 && Math.min(f.score_a, f.score_b) < Math.ceil(f.best_of / 2);
}

function divisionMap(fixtures: FixtureRow[]): { byTeam: Map<string, Division>; conflicts: Set<string> } {
  const byTeam = new Map<string, Division>();
  const conflicts = new Set<string>();
  for (const fixture of fixtures) {
    if (!/^week_\d+$/.test(fixture.stage) || !fixture.division) continue;
    for (const team of [fixture.team_a, fixture.team_b]) {
      if (!team) continue;
      const key = teamKey(team);
      const previous = byTeam.get(key);
      if (previous && previous !== fixture.division) conflicts.add(key);
      else if (!conflicts.has(key)) byTeam.set(key, fixture.division);
    }
  }
  return { byTeam, conflicts };
}

function rowDivision(row: SeasonRow, divisions: ReturnType<typeof divisionMap>): Division | null {
  if (row.division === "Solari" || row.division === "Lunari") return row.division;
  const key = teamKey(row.team_name);
  return divisions.conflicts.has(key) ? null : divisions.byTeam.get(key) ?? null;
}

function fixtureIsInDivision(fixture: FixtureRow, division: Division, divisions: ReturnType<typeof divisionMap>): boolean {
  if (fixture.division) return fixture.division === division;
  const a = fixture.team_a ? divisions.byTeam.get(teamKey(fixture.team_a)) : null;
  const b = fixture.team_b ? divisions.byTeam.get(teamKey(fixture.team_b)) : null;
  return a === division && (b === null || b === division);
}

function mergeDivisionalAwards(
  awards: SeasonAward[],
  divisionalResults: Map<Division, SeasonEndResult>,
): SeasonAward[] {
  return awards.map((award) => {
    if (award.scope !== "player") return award;

    const divisionStatuses = Object.fromEntries(DIVISIONS.map((division) => {
      const divisionalAward = divisionalResults.get(division)!.awards.find((candidate) => candidate.id === award.id)!;
      return [division, { status: divisionalAward.status, note: divisionalAward.note }];
    })) as Record<Division, DivisionAwardStatus>;
    const divisionalAwards = DIVISIONS.map((division) => divisionalResults.get(division)!.awards.find((candidate) => candidate.id === award.id)!);
    const winners = divisionalAwards.flatMap((divisionalAward, index) => divisionalAward.winners.map((winner) => ({
      ...winner,
      division: DIVISIONS[index],
    })));
    const statuses = divisionalAwards.map((divisionalAward) => divisionalAward.status);
    const status = winners.length
      ? "ready"
      : statuses.every((candidate) => candidate === "unearned")
        ? "unearned"
        : "unavailable";

    return {
      ...award,
      winners,
      status,
      note: status === "ready" ? undefined : divisionalAwards.find((candidate) => candidate.note)?.note,
      divisionStatuses,
    };
  });
}

export function deriveSeasonEnd(
  input: SeasonRow[],
  fixtures: FixtureRow[],
  season: string,
  league: keyof LeagueSeasons,
  options: DeriveOptions = {},
): SeasonEndResult {
  if (!seasonBelongsToLeague(season, league)) throw new Error("Season does not belong to this league.");
  const warnings: string[] = [];
  const seasonFixtures = fixtures.filter(f => f.season === season);
  const divisions = divisionMap(seasonFixtures);
  const regularFixtures = seasonFixtures
    .filter(f => /^week_\d+$/.test(f.stage))
    .filter(f => !options.division || fixtureIsInDivision(f, options.division, divisions));
  const scopedInput = options.division
    ? input.filter((row) => rowDivision(row, divisions) === options.division)
    : input;
  const fixtureTeams = new Set(regularFixtures.flatMap(f => [f.team_a, f.team_b]).filter((s): s is string => !!s).map(teamKey));
  const candidates = scopedInput.filter(r => r.season === season && r.season_phase === "Regular");
  const valid = candidates.filter(r => r.match_id && r.summoner_name && r.tag && r.team_name &&
    ["Blue", "Red"].includes(r.team_side) && typeof r.win === "boolean" &&
    (!fixtureTeams.size || fixtureTeams.has(teamKey(r.team_name))));
  if (valid.length !== candidates.length) warnings.push(`${candidates.length - valid.length} rows excluded for missing identity/team/result or teams outside this season's fixtures.`);
  // Reject ambiguous identities instead of letting duplicate ingestion inflate totals.
  const duplicateMatches = new Set(groups(valid, r => `${r.match_id}|${identity(r)}`).filter(g => g.length > 1).map(g => g[0].match_id));
  const rows = valid.filter(r => !duplicateMatches.has(r.match_id)).map(r => ({ ...r }));
  if (duplicateMatches.size) warnings.push(`${duplicateMatches.size} games excluded for duplicate player identities.`);
  const matches = new Map(groups(rows, r => r.match_id).map(g => [g[0].match_id, g]));
  const incompleteMatches = [...matches.values()].filter(g => g.length !== 10 || ["Blue", "Red"].some(side => {
    const team = g.filter(r => r.team_side === side);
    return team.length !== 5 || new Set(team.map(r => r.win)).size !== 1;
  }) || g.filter(r => r.win).length !== 5);
  const ambiguousTeams = [...matches.values()].filter(g => new Set(g.map(r => teamKey(r.team_name))).size !== 2 || ["Blue", "Red"].some(side =>
    new Set(g.filter(r => r.team_side === side).map(r => teamKey(r.team_name))).size !== 1));
  if (incompleteMatches.length) warnings.push(`${incompleteMatches.length} games have incomplete or conflicting participant records; winners are withheld.`);
  if (ambiguousTeams.length) warnings.push(`${ambiguousTeams.length} games have ambiguous team assignments; team-dependent awards are withheld. Individual statistics remain usable.`);
  const chronological = (a: SeasonRow, b: SeasonRow) => Date.parse(a.game_date) - Date.parse(b.game_date) || a.match_id.localeCompare(b.match_id, undefined, { numeric: true });
  const datesComplete = rows.every(r => Number.isFinite(Date.parse(r.game_date)));
  rows.sort(chronological);
  const players: Group[] = groups(rows, identity).map(rs => ({ name: identity(rs[0]), team: [...new Set(rs.map(r => r.team_name))].join(" / "), rows: rs }));
  const minGames = 5;
  const qualified = players.filter(p => p.rows.length >= minGames);
  const teamGames = groups(rows, r => `${r.match_id}|${teamKey(r.team_name)}`);
  const teams = groups(teamGames.map(g => g[0]), r => teamKey(r.team_name)).map(rs => ({ name: rs[0].team_name, team: rs[0].team_name, rows: rs }));
  const complete = regularFixtures.length > 0 && regularFixtures.every(completeFixture);
  const completed = regularFixtures.filter(completeFixture);
  const records = new Map<string, { wins: number; losses: number; name: string }>();
  for (const f of regularFixtures) for (const name of [f.team_a, f.team_b]) if (name && !records.has(teamKey(name))) records.set(teamKey(name), { name, wins: 0, losses: 0 });
  for (const f of completed) {
    if (!f.team_a || !f.team_b) continue;
    const a = records.get(teamKey(f.team_a))!, b = records.get(teamKey(f.team_b))!;
    if (f.score_a! > f.score_b!) { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
  }
  const rankCompare = (a: {wins: number; losses: number}, b: {wins: number; losses: number}) => b.wins - a.wins || a.losses - b.losses;
  // Derived fields require every underlying operand. A missing lane snapshot is
  // not a tied lane; ambiguous opposing roles are deliberately unscored.
  for (const r of rows) {
    const combine = (keys: string[]) => { const values = keys.map(k => number(r, k)); return values.includes(null) ? null : sum(values as number[]); };
    r.ability_casts = combine(["spell1_casts_q", "spell2_casts_w", "spell3_casts_e", "spell4_casts_r"]);
    r.heal_shield = combine(["healing_on_teammates", "shielding_on_teammates"]);
    const deaths = number(r, "deaths"), assists = number(r, "assists");
    r.deathless_games = deaths === null ? null : Number(deaths === 0);
    r.assist_games = assists === null ? null : Number(assists >= 10);
    const multi = all([r], "largest_multi_kill");
    r.highlight_games = multi ? Number(multi[0] >= 3) : null;
    const damage = number(r, "damage_share_pct"), gold = number(r, "gold_share_pct");
    r.share_efficiency = damage === null || gold === null || gold <= 0 ? null : damage / gold;
    const match = matches.get(r.match_id)!;
    const sameRole = match.filter(o => o.role === r.role && o.team_side === r.team_side);
    const opponents = match.filter(o => o.role === r.role && o.team_side !== r.team_side);
    for (const [key, raw] of [["gold_diff_15", "gold_at_15"], ["cs_diff_15", "cs_at_15"], ["gold_diff_10", "gold_at_10"]]) {
      const own = number(r, raw), other = opponents.length === 1 ? number(opponents[0], raw) : null;
      r[key] = r.role && sameRole.length === 1 && own !== null && other !== null ? own - other : null;
    }
    r.ahead_10 = r.gold_diff_10 == null ? null : Number(Number(r.gold_diff_10) > 0);
  }
  // Role-relative midrank percentiles make performance comparable across roles.
  // Fixed five-part score, shared by Late Bloomer and Metronome.
  const performanceFields = ["kda", "damage_per_min", "cs_per_min", "vision_score_per_min", "kill_participation_pct"];
  for (const roleRows of groups(rows, r => r.role)) {
    if (!roleRows[0].role || performanceFields.some(f => !all(roleRows, f))) continue;
    for (const r of roleRows) r.performance = mean(performanceFields.map(field => {
      const values = all(roleRows, field)!; const value = number(r, field)!;
      if (values.length === 1) return 50;
      return 100 * (values.filter(v => v < value).length + (values.filter(v => v === value).length - 1) / 2) / (values.length - 1);
    }));
  }
  const performance = (row: SeasonRow) => number(row, "performance") ?? 0;
  const scoreCovered = rows.length > 0 && rows.every((row) => typeof row.performance === "number" && Number.isFinite(row.performance));
  const unavailable = (def: AwardDefinition, note: string): SeasonAward => ({ ...def, winners: [], status: "unavailable", note });
  const choose = (def: AwardDefinition, values: AwardWinner[], lower = false, allowZero = false): SeasonAward => {
    const eligible = values.filter(v => Number.isFinite(v.value) && (allowZero || lower || v.value > 0));
    if (!eligible.length) return { ...def, winners: [], status: "unearned", note: "No qualifying achievement yet." };
    const best = (lower ? Math.min : Math.max)(...eligible.map(v => v.value));
    return { ...def, status: "ready", winners: eligible.filter(v => Math.abs(v.value - best) < 1e-9).sort((a,b) => a.name.localeCompare(b.name)) };
  };
  const winner = (g: Group, value: number, detail?: string): AwardWinner => ({ name: g.name, team: g.team, games: g.rows.length, value, detail });
  const missing = (def: AwardDefinition) => unavailable(def, "Required observations are missing or ambiguous; no winner declared from incomplete data.");
  const baseAwards = SEASON_AWARDS.map((def): SeasonAward => {
    if (!rows.length) return unavailable(def, "No regular-season games available for this league and season.");
    if (incompleteMatches.length || duplicateMatches.size || valid.length !== candidates.length) return unavailable(def, "Season contains incomplete or conflicting participant records. Repair ingestion before declaring winners.");
    if (ambiguousTeams.length && (def.group === "Teamwork" && def.id !== "clean-sweep")) return unavailable(def, "A game has conflicting team assignments; correct the match's team labels before awarding this card.");
    if (def.id === "best-of-champion") {
      if (!scoreCovered) return unavailable(def, "Required role or performance observations are missing; no champion cards declared.");
      if (rows.some((row) => !row.champion?.trim())) return unavailable(def, "Champion data is missing from one or more regular-season games; no champion cards declared.");

      const byChampion = new Map<string, SeasonRow[]>();
      for (const row of rows) {
        const champion = championDisplayName(row.champion.trim());
        byChampion.set(champion, [...(byChampion.get(champion) ?? []), row]);
      }

      const candidates = [...byChampion.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .flatMap(([champion, championRows]) => groups(championRows, playerKey).map((playerRows) => {
          const wins = playerRows.filter((row) => row.win).length;
          const score = 60 * wins / playerRows.length + 0.4 * mean(playerRows.map(performance));
          const first = playerRows[0];
          const playerName = identity(first);
          const kills = sum(playerRows.map((row) => number(row, "kills") ?? 0));
          const deaths = sum(playerRows.map((row) => number(row, "deaths") ?? 0));
          const assists = sum(playerRows.map((row) => number(row, "assists") ?? 0));
          return {
            name: playerName,
            team: [...new Set(playerRows.map((row) => row.team_name))].join(" / "),
            value: score,
            games: playerRows.length,
            detail: `${champion} · ${wins}–${playerRows.length - wins} · ${playerRows.length} games · ${((kills + assists) / Math.max(1, deaths)).toFixed(2)} KDA`,
            champion,
            championGames: playerRows.length,
            playerKeys: [playerKey(first)],
            title: `Best of ${champion}`,
            key: `${playerKey(first)}:${champion}`,
            playerKey: playerKey(first),
          };
        }));
      const assigned = assignChampions(candidates);
      const assignedPlayers = new Set(assigned.map((candidate) => candidate.playerKey));
      const unassigned = players
        .filter((player) => !assignedPlayers.has(playerKey(player.rows[0])))
        .map((player) => player.name);
      if (!options.division && unassigned.length) warnings.push(`Best of Champion covers ${assigned.length}/${players.length} players. No eligible unused played champion for: ${unassigned.join(", ")}.`);
      return assigned.length
        ? { ...def, winners: assigned, status: "ready" }
        : { ...def, winners: [], status: "unearned", note: "No qualifying champion assignment yet." };
    }
    if (def.field) {
      const isRate = def.mode !== "total";
      const pool = isRate ? qualified : players;
      const values: AwardWinner[] = [];
      for (const p of pool) {
        // Short games cannot have a 15-minute snapshot. Every game reaching the
        // checkpoint must have an unambiguous observation before ranking anyone.
        const checkpoint = ["gold_diff_15", "cs_diff_15"].includes(def.field) ? 15 : def.field === "ahead_10" ? 10 : 0;
        if (checkpoint && p.rows.some(r => number(r, "game_duration_min") === null)) return missing(def);
        const measured = checkpoint ? p.rows.filter(r => number(r, "game_duration_min")! >= checkpoint) : p.rows;
        const observations = all(measured, def.field);
        if (!observations) return missing(def);
        if (!measured.length || (isRate && measured.length < minGames)) continue;
        const total = sum(observations);
        let divisor = 1;
        if (def.mode === "perGame" || def.mode === "mean") divisor = measured.length;
        if (def.mode === "minute" || def.mode === "gold") {
          const denominators = all(measured, def.mode === "minute" ? "game_duration_min" : "gold_earned");
          if (!denominators || denominators.some(v => v <= 0)) return missing(def);
          divisor = sum(denominators);
        }
        const average = total / measured.length;
        const value = def.mode === "rate" ? average * 100 : total / divisor;
        values.push({ ...winner(p, value), games: measured.length, total, perGame: def.mode === "rate" ? value : average });
      }
      return choose(def, values, def.lower, def.mode === "mean");
    }
    if (["bloodline", "late-bloomer"].includes(def.id) && !datesComplete) return missing(def);
    if (def.id === "bloodline") {
      if (players.some(p => !all(p.rows, "solo_kills"))) return missing(def);
      return choose(def, players.map(p => winner(p, longest(all(p.rows, "solo_kills")!.map(v => v > 0)))));
    }
    if (def.id === "world-tour") {
      if (rows.filter(r => r.win).some(r => !championCategories(r.champion, "regions"))) return unavailable(def, "Champion mapping missing for a winning pick; update the pinned Riot mapping.");
      return choose(def, players.map(p => {
        const categories = [...new Set(p.rows.filter(r => r.win).flatMap(r => championCategories(r.champion, "regions")!))].sort();
        return winner(p, categories.length, categories.join(" · "));
      }));
    }
    if (def.id === "against-the-grain") {
      if (rows.some(r => !r.champion)) return missing(def);
      const picks = new Map(groups(rows, r => normalized(r.champion)).map(g => [normalized(g[0].champion), g.length]));
      return choose(def, qualified.map(p => winner(p, 100 * p.rows.filter(r => picks.get(normalized(r.champion))! / matches.size <= .05).length / p.rows.length)));
    }
    if (["late-bloomer", "metronome"].includes(def.id)) {
      if (qualified.some(p => !all(p.rows, "performance"))) return missing(def);
      const orderedMatches = [...matches.values()].sort((a,b) => chronological(a[0], b[0]));
      const finalThird = new Set(orderedMatches.slice(Math.floor(orderedMatches.length * 2 / 3)).map(g => g[0].match_id));
      const values: AwardWinner[] = [];
      for (const p of qualified) {
        const subset = def.id === "late-bloomer" ? p.rows.filter(r => finalThird.has(r.match_id)) : p.rows;
        if (subset.length < 3) continue;
        const scores = all(subset, "performance")!; const average = mean(scores);
        if (def.id === "metronome" && (average < 60 || Math.min(...scores) < 40)) continue;
        const value = def.id === "late-bloomer" ? average : Math.sqrt(mean(scores.map(s => (s - average) ** 2)));
        values.push({ ...winner(p, value, `${average.toFixed(1)} mean performance · ${subset.length} games`), games: subset.length });
      }
      return choose(def, values, def.id === "metronome", true);
    }
    if (def.id === "clean-sweep") {
      if (!regularFixtures.length) return unavailable(def, "No regular-season fixtures available.");
      const series = new Map<string, { name: string; sweeps: number; completed: number }>();
      for (const f of completed) {
        if (f.best_of <= 1) continue;
        const winnerKey = f.score_a! > f.score_b! ? teamKey(f.team_a ?? "") : teamKey(f.team_b ?? "");
        for (const name of [f.team_a, f.team_b]) {
          if (!name) continue;
          const key = teamKey(name);
          const entry = series.get(key) ?? { name, sweeps: 0, completed: 0 };
          entry.completed++;
          if (key === winnerKey && Math.min(f.score_a!, f.score_b!) === 0) entry.sweeps++;
          series.set(key, entry);
        }
      }
      const teamGameCounts = new Map<string, number>();
      for (const g of teamGames) teamGameCounts.set(teamKey(g[0].team_name), (teamGameCounts.get(teamKey(g[0].team_name)) ?? 0) + 1);
      const values = [...series.values()]
        .filter((entry) => (teamGameCounts.get(teamKey(entry.name)) ?? 0) >= minGames)
        .map((entry) => {
          const value = 100 * entry.sweeps / entry.completed;
          return { name: entry.name, team: entry.name, value, games: entry.completed, total: entry.sweeps, perGame: value, detail: `${entry.sweeps} sweep${entry.sweeps === 1 ? "" : "s"} · ${entry.completed} completed multi-game series` };
        });
      return choose(def, values);
    }
    if (def.id === "the-starting-five") {
      if (!complete) return unavailable(def, "Waiting for final regular-season standings.");
      const standings = [...records.values()].sort(rankCompare);
      const leaders = standings.filter(r => rankCompare(r, standings[0]) === 0);
      const values: AwardWinner[] = [];
      for (const leader of leaders) {
        const lineups = teamGames.filter(g => teamKey(g[0].team_name) === teamKey(leader.name));
        if (!lineups.length || lineups.some(g => g.length !== 5 || new Set(g.map(r => r.role)).size !== 5 || !["TOP","JUNGLE","MIDDLE","BOTTOM","UTILITY"].every(role => g.some(r => r.role === role)))) return missing(def);
        const lineupCounts = new Map<string, SeasonRow[][]>();
        for (const g of lineups) { const key = g.map(identity).sort().join(" · "); lineupCounts.set(key, [...(lineupCounts.get(key) ?? []), g]); }
        const most = Math.max(...[...lineupCounts.values()].map(g => g.length));
        for (const [names, appearances] of lineupCounts) if (appearances.length === most) values.push({ name: leader.name, team: leader.name, value: leader.wins, games: appearances.length, detail: `${names} · ${appearances.length} games together · ${leader.wins}–${leader.losses} series` });
      }
      return choose(def, values);
    }
    if (def.id === "jungle-mid-connection") {
      const pairs = new Map<string, AwardWinner & { wins: number }>();
      for (const g of teamGames) {
        const jungle = g.filter(r => r.role === "JUNGLE"), mid = g.filter(r => r.role === "MIDDLE");
        if (jungle.length !== 1 || mid.length !== 1) return missing(def);
        const name = `${identity(jungle[0])} + ${identity(mid[0])}`, key = `${teamKey(g[0].team_name)}|${name}`;
        const pair = pairs.get(key) ?? { name, team: g[0].team_name, value: 0, games: 0, wins: 0 };
        pair.games++;
        if (g[0].win) pair.wins++;
        pairs.set(key, pair);
      }
      const values = [...pairs.values()]
        .filter((pair) => pair.games >= minGames)
        .map((pair) => ({
          ...pair,
          value: 100 * pair.wins / pair.games,
          total: pair.wins,
          perGame: 100 * pair.wins / pair.games,
          detail: `${pair.wins}–${pair.games - pair.wins} together`,
        }));
      return choose(def, values);
    }
    const values: AwardWinner[] = [];
    for (const t of teams) {
      const numbers: number[] = [];
      for (const r of t.rows) {
        const g = teamGames.find(g => g[0].match_id === r.match_id && teamKey(g[0].team_name) === teamKey(r.team_name))!;
        if (g.some(o => o.win !== r.win || o.team_side !== r.team_side)) return missing(def);
        let value: number | null = null;
        if (def.id === "dragon-hoard" || def.id === "baron-society") {
          const fields = all(g, def.id === "dragon-hoard" ? "team_dragons" : "team_barons");
          if (fields && new Set(fields).size === 1) value = fields[0];
        } else if (def.id === "fortress") {
          const opponent = matches.get(r.match_id)!.filter(o => o.team_side !== r.team_side);
          const fields = all(opponent, "team_towers");
          if (fields?.length && new Set(fields).size === 1) value = fields[0];
        } else {
          const duration = number(r, "game_duration_min");
          if (duration !== null && duration > 0) value = def.id === "speedrunners" ? duration : Number(r.win && duration > 40);
          if (def.id === "speedrunners" && !r.win) continue;
        }
        if (value === null) return missing(def);
        numbers.push(value);
      }
      if (def.id === "speedrunners" && numbers.length < 3) continue;
      if (["fortress", "dragon-hoard", "baron-society", "marathon-winners"].includes(def.id) && t.rows.length < minGames) continue;
      const total = sum(numbers);
      const average = mean(numbers);
      const value = ["fortress", "speedrunners"].includes(def.id)
        ? average
        : def.mode === "rate"
          ? average * 100
          : def.mode === "perGame"
            ? average
            : total;
      values.push({ ...winner(t, value), games: numbers.length, total, perGame: def.mode === "rate" ? value : average });
    }
    return choose(def, values, ["fortress", "speedrunners"].includes(def.id));
  });
  const result = { awards: baseAwards, games: matches.size, players: players.length, minGames, complete, warnings };
  const hasDivisionData = !options.division && DIVISIONS.some((division) => rows.some((row) => rowDivision(row, divisions) === division));
  if (!hasDivisionData) return result;

  const divisionalResults = new Map<Division, SeasonEndResult>(DIVISIONS.map((division) => [
    division,
    deriveSeasonEnd(input, fixtures, season, league, { division }),
  ]));
  return { ...result, awards: mergeDivisionalAwards(baseAwards, divisionalResults) };
}
