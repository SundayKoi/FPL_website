// Company on the road: the other people in the world of a run.
//
// Two of the trail's beats stop being coins here (COMPANY_RULES). A RIVAL
// squad is another collector's run on the same route — the one launched
// closest before the encounter's hour, within a day — and the spot goes
// to the squad with more shine; the seeded coin only breaks a tie. Both
// journals say who, by name. Nobody on the road means the road was the
// squad's alone, and the cairn where the rival would have been holds a
// cache instead. A GHOST is a card that died on the Legendary route,
// walking the Legend and Legendary roads for everyone until the season
// ends: camp at the next fork and the haunting is doubled; push and it
// is harmless; carry a card in its old team's colours and it stands
// aside and leaves a cache.
//
// Pure. queries.ts fetches the candidates — other people's runs and the
// league's graveyard are owner-scoped under RLS, so only trusted server
// code can read them — and this decides. Stable once the hour has passed:
// the candidates are runs that LAUNCHED before it and graves DUG before
// it, and neither set can grow after the fact, so the page, the ping and
// the claim, reading at different times, agree on who was there.

import { mulberry32 } from "@/lib/gauntlet/sim";
import type { Encounter } from "./journal";
import { COMPANY_RULES } from "./routes";

/** How long before an encounter's hour a launch counts as being on the
 *  same road. */
export const RIVAL_WINDOW_MS = 24 * 60 * 60 * 1000;

/** A rival met on one of this run's legs. `won` is this run's verdict. */
export interface RivalMeet {
  leg: number;
  runId: number;
  /** The other collector's discord id and username. */
  who: string;
  name: string;
  shine: number;
  theirShine: number;
  won: boolean;
}

/** Another run's rival encounter that picked THIS run as the rival: the
 *  other side of a meet, written into this journal too. `won` is this
 *  run's side of it. */
export interface Crossing {
  at: string;
  runId: number;
  who: string;
  name: string;
  won: boolean;
}

/** A ghost met on one of this run's legs. */
export interface GhostMeet {
  leg: number;
  graveId: number;
  cardName: string;
  /** Whose card it was. */
  who: string;
  name: string;
  team: string | null;
  /** The squad carries the dead card's team: the ghost stands aside. */
  stood: boolean;
}

export interface RoadCompany {
  rivals: RivalMeet[];
  crossings: Crossing[];
  ghosts: GhostMeet[];
}

/** A run as the rival search reads it — any collector's. */
export interface RunCandidate {
  id: number;
  discordId: string;
  tier: string;
  shine: number;
  startedAt: string;
  resolvesAt: string;
  forks: number;
  rules: number;
  convoy: number | null;
}

/** A grave as the ghost search reads it — any collector's, `route` deaths only. */
export interface GraveCandidate {
  id: number;
  discordId: string;
  playerName: string;
  team: string | null;
  diedAt: string;
}

/** The other collector's run on this route at the encounter's hour: the
 *  one launched closest before it within RIVAL_WINDOW_MS, never a run of
 *  the same collector and never the convoy partner (two squads on one
 *  clock stand at one fork; they are not racing each other). Ties on the
 *  launch time go to the lower id. */
export function rivalFor(mine: Pick<RunCandidate, "id" | "discordId" | "tier" | "convoy">, at: Date, pool: RunCandidate[]): RunCandidate | null {
  const hour = at.getTime();
  let best: RunCandidate | null = null;
  for (const run of pool) {
    if (run.id === mine.id || run.discordId === mine.discordId || run.tier !== mine.tier) continue;
    if (mine.convoy !== null && run.convoy === mine.convoy) continue;
    const started = Date.parse(run.startedAt);
    if (!(started < hour) || started < hour - RIVAL_WINDOW_MS) continue;
    if (!best || started > Date.parse(best.startedAt) || (started === Date.parse(best.startedAt) && run.id < best.id)) best = run;
  }
  return best;
}

/** Who took the spot: more shine wins, and the coin tossed at derivation
 *  breaks a tie. `coin` is the encounter's own `won`. */
export function rivalVerdict(myShine: number, theirShine: number, coin: boolean): boolean {
  if (myShine !== theirShine) return myShine > theirShine;
  return coin;
}

/** The ghost on a leg: one of the graves dug before the hour, picked from
 *  the run's own seed so the page and the claim name the same one. */
export function ghostFor(runId: number, leg: number, at: Date, graves: GraveCandidate[]): GraveCandidate | null {
  const hour = at.getTime();
  const eligible = graves.filter((grave) => Date.parse(grave.diedAt) < hour).sort((a, b) => a.id - b.id);
  if (eligible.length === 0) return null;
  const rand = mulberry32((runId * 7919 + leg * 131 + 9) >>> 0);
  return eligible[Math.min(eligible.length - 1, Math.floor(rand() * eligible.length))];
}

export interface CompanyInput {
  /** This run. */
  mine: RunCandidate;
  /** Its encounters, as encountersFor draws them without company. */
  encounters: Encounter[];
  /** Every other run on this route launched from a day before this one
   *  to a day after it (or its end, whichever is later) — the window
   *  that holds every rival this run can meet and every run that can
   *  meet this one. */
  others: RunCandidate[];
  /** The season's `route` graves. */
  graves: GraveCandidate[];
  /** Usernames by discord id. */
  names: Map<string, string>;
  /** The teams this squad carries, for the ghost's colours. */
  squadTeams: string[];
  /** encountersFor, handed in so this module does not import the journal. */
  encountersOf: (run: RunCandidate) => Encounter[];
}

const nameOf = (names: Map<string, string>, who: string) => names.get(who) ?? "Another collector";

/** Everyone this run meets, and everyone who meets it. */
export function companyFor(input: CompanyInput): RoadCompany {
  const { mine, encounters, others, graves, names, squadTeams, encountersOf } = input;
  const company: RoadCompany = { rivals: [], crossings: [], ghosts: [] };
  if (mine.rules < COMPANY_RULES) return company;

  const pool = [mine, ...others];
  for (const encounter of encounters) {
    if (encounter.key === "rival") {
      const rival = rivalFor(mine, encounter.at, pool);
      if (!rival) continue;
      company.rivals.push({
        leg: encounter.leg,
        runId: rival.id,
        who: rival.discordId,
        name: nameOf(names, rival.discordId),
        shine: mine.shine,
        theirShine: rival.shine,
        won: rivalVerdict(mine.shine, rival.shine, encounter.won === true),
      });
    } else if (encounter.key === "ghost") {
      const grave = ghostFor(mine.id, encounter.leg, encounter.at, graves);
      if (!grave) continue;
      company.ghosts.push({
        leg: encounter.leg,
        graveId: grave.id,
        cardName: grave.playerName,
        who: grave.discordId,
        name: nameOf(names, grave.discordId),
        team: grave.team,
        stood: grave.team !== null && squadTeams.includes(grave.team),
      });
    }
  }

  // The other side: every other run whose rival encounter picked this one.
  for (const other of others) {
    if (other.rules < COMPANY_RULES || other.tier !== mine.tier || other.discordId === mine.discordId) continue;
    for (const encounter of encountersOf(other)) {
      if (encounter.key !== "rival") continue;
      const picked = rivalFor(other, encounter.at, pool);
      if (!picked || picked.id !== mine.id) continue;
      const theirs = rivalVerdict(other.shine, mine.shine, encounter.won === true);
      company.crossings.push({ at: encounter.at.toISOString(), runId: other.id, who: other.discordId, name: nameOf(names, other.discordId), won: !theirs });
    }
  }
  company.crossings.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return company;
}

/** An empty company, for a run that met nobody or predates the rule. */
export const NO_COMPANY: RoadCompany = { rivals: [], crossings: [], ghosts: [] };

/** A rival as the claim writes it into the outcome (`rivals`). */
export interface RivalRecord {
  who: string;
  name: string;
  runId: number;
  won: boolean;
}

/** One collector this squad has raced this season, and the score. */
export interface Rivalry {
  who: string;
  name: string;
  /** Spots this collector's squads took off theirs, and the reverse. */
  beaten: number;
  beatenBy: number;
  /** The newest meet, ISO. */
  last: string;
}

/** The season's rivalries from the claimed runs that carry them: this
 *  collector's own runs (the rivals THEY met) and everyone else's runs
 *  that met them. Newest first. */
export function tallyRivalries(
  me: string,
  records: { owner: string; claimedAt: string; rivals: RivalRecord[] }[],
  names: Map<string, string>,
): Rivalry[] {
  const byWho = new Map<string, Rivalry>();
  const note = (who: string, name: string, won: boolean, when: string) => {
    const entry = byWho.get(who) ?? { who, name, beaten: 0, beatenBy: 0, last: when };
    if (won) entry.beaten += 1;
    else entry.beatenBy += 1;
    if (Date.parse(when) > Date.parse(entry.last)) entry.last = when;
    byWho.set(who, entry);
  };
  for (const record of records) {
    for (const rival of record.rivals) {
      if (record.owner === me && rival.who !== me) note(rival.who, names.get(rival.who) ?? rival.name, rival.won, record.claimedAt);
      else if (record.owner !== me && rival.who === me) note(record.owner, names.get(record.owner) ?? "Another collector", !rival.won, record.claimedAt);
    }
  }
  return [...byWho.values()].sort((a, b) => Date.parse(b.last) - Date.parse(a.last));
}
