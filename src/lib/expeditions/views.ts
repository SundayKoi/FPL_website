// What the board may show about a run in the field, computed on the server.
//
// The road, the journal, the encounters and the edges are all derived from
// the run's row and the squad's frozen cards (routes.ts, journal.ts), so
// whoever holds those two modules holds every checkpoint a squad has not
// reached yet. The page is a server component: it derives one RunView per
// run here and hands the board only that. A place the squad does not know
// is ABSENT from the view — no key, no title, no story — not merely
// flagged: what never leaves the server cannot be read off a prop, a
// hover or the bundle. What an unknown place does show is a `?` and, when
// the squad can tell, its danger (reveal.ts).
//
// The view is also the living map's input (spec §6): every checkpoint and
// every surfaced journal line carries its position along the run's clock
// as a fraction, company and storms carry theirs, and the run's weather
// rides along. `nextAt` is the next instant the view changes — a line due,
// a fork opening or closing, the squad home — so the board can
// router.refresh() then instead of keeping a journal clock of its own.
//
// Server-only: this module imports the road and the journal, which is the
// whole of what it exists to keep out of the browser. Its types are
// erased at build, so a client component may `import type` them.

import "server-only";
import { ARCHETYPE_RULES, abilitySheet, traitsOf, type AbilityKind } from "./archetypes";
import { nextTier, type CampaignState } from "./campaigns";
import type { AtlasLandmark } from "./atlas";
import type { CardCopy, ExpeditionTierKey } from "./config";
import type { RoadCompany } from "./company";
import { ROAD_RULES, choiceSheet, forkViews, isCampChoice, type ForkChoice, type ForkOption, type ForkStatus, type ForkView } from "./forks";
import { STORM_HOURS, banterFor, encountersFor, journalFor, type EncounterKey, type JournalEntry } from "./journal";
import { hasTrail, roadOf, type ConvoyView, type ExpeditionRun } from "./queries";
import { REVEAL_FRAGMENTS, dangerOf, knownCheckpoints, wardenActive, type PaidReveals, type RevealReads, type RevealedBy } from "./reveal";
import { forkOptions, forksFor, underWeather, type ForkDef } from "./routes";
import type { WeatherKey } from "./weather";

// === the view ================================================================

/** A landmark on a known checkpoint (the atlas, spec §5): who reached the
 *  place first this season. */
export interface LandmarkView {
  /** The username of whoever named it. */
  by: string;
  /** Whether that was the viewer. */
  mine: boolean;
  /** Whether the namer's trophy wall carries their crest. */
  crest: boolean;
}

/** A landmark as the page hands it in: one per named place. */
export interface LandmarkRef extends LandmarkView {
  /** The place key it was named at. */
  place: string;
}

/**
 * The season's landmarks (fetchLandmarks) as the views take them: who
 * named each place, whether that was the reader, and whether the namer's
 * trophy wall carries a crest (`crests`, the discord ids whose base camp
 * wall is at its top level; empty until the camp is read). Null — the
 * landmarks could not be read — is no landmarks: every known place shows
 * without one.
 */
export function landmarkRefs(landmarks: AtlasLandmark[] | null, viewerId: string | null, crests: ReadonlySet<string> = new Set()): LandmarkRef[] {
  return (landmarks ?? []).map((landmark) => ({
    place: landmark.place,
    by: landmark.username,
    mine: viewerId !== null && landmark.discordId === viewerId,
    crest: crests.has(landmark.discordId),
  }));
}

/** What every checkpoint shows, known or not. */
interface PlaceBase {
  index: number;
  /** Where the checkpoint sits along the run's clock, 0..1. */
  at: number;
  opensAt: string;
  closesAt: string;
  status: ForkStatus;
  /** A decided fork the squad answered with a push. */
  pushed: boolean;
  /** The dread mark: the squad warns against this place. Always shown. */
  warned: boolean;
  /** Dark enough that a foil lights the way; null when the squad cannot
   *  tell (an unknown place with no Warden). */
  dark: boolean | null;
  /** Camping here charges a toll; null when the squad cannot tell. */
  toll: boolean | null;
}

/** A checkpoint the squad knows: named, with why it knows it. */
export interface KnownPlaceView extends PlaceBase {
  known: true;
  key: string;
  title: string;
  /** The answer given here, "camp" for a missed fork, null ahead. */
  choice: ForkChoice | null;
  revealedBy: RevealedBy;
  landmark: LandmarkView | null;
}

/** A checkpoint the squad does not know: a `?` and its danger. Carries no
 *  key, no title and no story — those stay on the server. */
export interface UnknownPlaceView extends PlaceBase {
  known: false;
  mark: "?";
}

export type PlaceView = KnownPlaceView | UnknownPlaceView;

/** One journal line the squad has written so far. */
export interface JournalLineView {
  at: string;
  leg: number;
  kind: JournalEntry["kind"];
  text: string;
  encounter?: EncounterKey;
  /** Where the line sits along the run's clock, 0..1: a pin on the map. */
  fraction: number;
}

/** The fork waiting on an answer, with everything the prompt prints. */
export interface OpenForkView {
  index: number;
  key: string;
  title: string;
  story: string;
  /** The Legendary route's singing dark, named for the squad's real next
   *  opponent. Printed in place of `story` when present. */
  rivalStory: string | null;
  banter: string | null;
  /** forkOptions for this squad at this fork: locked ones say why, and
   *  under ARCHETYPE_RULES each carries its `edges` and `baseTease`. */
  options: ForkOption[];
  opensAt: string;
  closesAt: string;
  /** The run's last fork. */
  last: boolean;
}

/** One squad member's edge, as the run card prints it. */
export interface EdgeView {
  copyId: number;
  title: string;
  kind: AbilityKind;
  does: string;
  /** It acts on this run: its kind's winner, under ARCHETYPE_RULES. */
  counts: boolean;
}

/** A rival met on the road, or a run that met this one. */
export interface RivalView {
  leg: number;
  at: string;
  fraction: number;
  /** The other collector, or null for a rival from before company. */
  name: string | null;
  /** This squad took the spot. */
  won: boolean;
  /** The other side of a meet: their rival encounter picked this squad. */
  crossing: boolean;
}

export interface GhostView {
  leg: number;
  at: string;
  fraction: number;
  /** The dead card's name, or null when the road's company was not read. */
  name: string | null;
  /** Whose card it was. */
  owner: string | null;
  /** The squad carried its colours and it stood aside. */
  stood: boolean;
}

export interface StormView {
  leg: number;
  at: string;
  fraction: number;
  hours: number;
}

/** Where the See-the-road-ahead button stands: `ready` to press; `paid`
 *  or `partner` when this road is already revealed (by the collector or
 *  the convoy partner); `known` when the squad already knows every
 *  checkpoint ahead without it; `short` when the collector holds too few
 *  fragments. */
export type RevealState = "ready" | "paid" | "partner" | "known" | "short";

/** The See-the-road-ahead button: what it costs and whether it can be
 *  pressed, with the reason in words when it cannot. */
export interface RevealOffer {
  state: RevealState;
  fragments: number;
  available: boolean;
  reason: string | null;
}

export interface RunView {
  runId: number;
  tier: ExpeditionTierKey;
  /** The server clock the view was derived at. */
  asOf: string;
  startedAt: string;
  resolvesAt: string;
  weather: WeatherKey | null;
  road: PlaceView[];
  journal: JournalLineView[];
  /** The next instant this view changes; null once nothing more will. */
  nextAt: string | null;
  openFork: OpenForkView | null;
  edges: EdgeView[];
  /** Surfaced so far: nobody met on a leg the squad has not walked. */
  company: { rivals: RivalView[]; ghosts: GhostView[] };
  storms: StormView[];
  /** Null when the button does not belong on the card: the reveals could
   *  not be read (the migration is not applied), or there is no road left
   *  ahead to see. */
  reveal: RevealOffer | null;
  /** The base camp's tent, as it stands (it is read again at the claim). */
  tent: number;
}

// === the rival fork =========================================================

/** The Legendary route's singing dark, when a one-roster squad's real next
 *  opponent is known: what is singing under the floor has a name. Keyed on
 *  the PLACE, not the slot — on a drawn road only one of three sings. */
export const RIVAL_FORK: { tier: ExpeditionTierKey; key: string } = { tier: "legendary", key: "singing" };

export function rivalStory(rival: string): string {
  return `Something is singing under the floor and the squad knows the song — it is ${rival}'s, and they are playing them next. There is light ahead, and the singing gets louder toward it.`;
}

// === deriving it =============================================================

export interface RunViewInput {
  /** The run, with `company` and `weather` attached as the page reads
   *  them. Neither is passed on to the browser except through this view. */
  run: ExpeditionRun;
  /** The run's own copies, in squad order. */
  copies: CardCopy[];
  now: Date;
  /** The paid reveals that touch this run, or null when they could not be
   *  read — the fog still applies, and the reveal button stays hidden. */
  reveals: PaidReveals | null;
  /** The convoy partner's name, for the reveal button's reason. */
  partnerName?: string | null;
  /** The squad's team's next real opponent, for the Legendary route. */
  rival?: string | null;
  camp?: { tent: number } | null;
  /** Map fragments held, when known: the button says so when it is short. */
  fragments?: number | null;
  landmarks?: LandmarkRef[];
}

const FAR_FUTURE = new Date(8.64e15);

function fractionOf(at: number, start: number, end: number): number {
  const span = end - start;
  if (!(span > 0)) return 0;
  return Math.max(0, Math.min(1, (at - start) / span));
}

function pushedAt(fork: ForkView): boolean {
  return fork.status === "decided" && fork.choice !== null && !isCampChoice(fork.choice);
}

/** The road as the squad knows it: known places in full, unknown ones as
 *  a `?` with their danger. */
function roadView(run: ExpeditionRun, copies: CardCopy[], forks: ForkView[], places: ForkDef[], reveals: PaidReveals | null, landmarks: LandmarkRef[]): PlaceView[] {
  const known = knownCheckpoints(run, copies, forks, reveals ?? { paid: false, partner: false });
  const warden = wardenActive(copies, run.rules);
  const legs = run.forks + 1;
  return forks.flatMap((fork): PlaceView[] => {
    const drawn = places[fork.index];
    if (!drawn) return [];
    const place = underWeather(drawn, run.weather ?? null);
    const base = {
      index: fork.index,
      at: (fork.index + 1) / legs,
      opensAt: fork.opensAt.toISOString(),
      closesAt: fork.closesAt.toISOString(),
      status: fork.status,
      pushed: pushedAt(fork),
    };
    const by = known.get(fork.index);
    if (by === undefined) {
      return [{ ...base, ...dangerOf(place, warden), known: false, mark: "?" }];
    }
    const landmark = landmarks.find((entry) => entry.place === place.key);
    return [
      {
        ...base,
        warned: place.warned === true,
        dark: place.dark === true,
        toll: (place.toll ?? 0) > 0,
        known: true,
        key: place.key,
        title: place.title,
        choice: fork.choice,
        revealedBy: by,
        landmark: landmark ? { by: landmark.by, mine: landmark.mine, crest: landmark.crest } : null,
      },
    ];
  });
}

/**
 * Everything the board shows about one run in the field. Deterministic in
 * its inputs: the same row, squad and clock give the same view, which is
 * what lets the page, a refresh and a test agree.
 */
export function runViewFor(input: RunViewInput): RunView {
  const { run, copies, now } = input;
  const tier = run.tier as ExpeditionTierKey;
  const start = Date.parse(run.startedAt);
  const end = Date.parse(run.resolvesAt);
  const weather = run.weather ?? null;
  const company: RoadCompany | null = run.company ?? null;
  const road = roadOf(run);
  const places = forksFor(tier, road);
  const forks = forkViews(run, now).filter((fork) => fork.index < places.length);
  const journalRun = {
    id: run.id,
    tier,
    startedAt: run.startedAt,
    resolvesAt: run.resolvesAt,
    forks: run.forks,
    claimedAt: run.claimedAt,
    rules: run.rules,
    convoy: run.convoy,
    choices: run.choices,
    company,
    weather,
    // A campaign's road: the journal names the places the map does.
    road: run.road ?? null,
  };

  // The whole journal, then cut at the clock: the future half is what
  // nextAt is made of, and never leaves this function.
  const written = journalFor(journalRun, copies, FAR_FUTURE);
  const surfaced = run.claimedAt ? written : written.filter((entry) => entry.at.getTime() <= now.getTime());
  const journal: JournalLineView[] = surfaced.map((entry) => ({
    at: entry.at.toISOString(),
    leg: entry.leg,
    kind: entry.kind,
    text: entry.text,
    ...(entry.encounter ? { encounter: entry.encounter } : {}),
    fraction: fractionOf(entry.at.getTime(), start, end),
  }));

  // The beats the journal has already told, for the map's markers. The
  // same draw the journal made: same company, weather and traits.
  const seen = (at: Date) => run.claimedAt !== null || at.getTime() <= now.getTime();
  const traits = run.rules >= ARCHETYPE_RULES ? traitsOf(copies, run.rules) : null;
  const encounters = encountersFor(journalRun, company, weather, traits).filter((encounter) => seen(encounter.at));
  const rivals: RivalView[] = [
    ...encounters
      .filter((encounter) => encounter.key === "rival" && !encounter.alone)
      .map((encounter) => ({
        leg: encounter.leg,
        at: encounter.at.toISOString(),
        fraction: fractionOf(encounter.at.getTime(), start, end),
        name: encounter.rivalName ?? null,
        won: encounter.won === true,
        crossing: false,
      })),
    ...(company?.crossings ?? [])
      .filter((crossing) => seen(new Date(crossing.at)))
      .map((crossing) => {
        const at = Date.parse(crossing.at);
        const leg = Math.max(0, Math.min(run.forks, Math.floor(fractionOf(at, start, end) * (run.forks + 1))));
        return { leg, at: new Date(at).toISOString(), fraction: fractionOf(at, start, end), name: crossing.name, won: crossing.won, crossing: true };
      }),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const ghosts: GhostView[] = encounters
    .filter((encounter) => encounter.key === "ghost")
    .map((encounter) => ({
      leg: encounter.leg,
      at: encounter.at.toISOString(),
      fraction: fractionOf(encounter.at.getTime(), start, end),
      name: encounter.ghost?.name ?? null,
      owner: encounter.ghost?.owner ?? null,
      stood: encounter.ghost?.stood === true,
    }));
  const storms: StormView[] = encounters
    .filter((encounter) => encounter.key === "storm")
    .map((encounter) => ({ leg: encounter.leg, at: encounter.at.toISOString(), fraction: fractionOf(encounter.at.getTime(), start, end), hours: STORM_HOURS }));

  const placeViews = roadView(run, copies, forks, places, input.reveals, input.landmarks ?? []);

  const open = run.claimedAt ? null : (forks.find((fork) => fork.status === "open") ?? null);
  const openPlace = open ? places[open.index] : undefined;
  const openFork: OpenForkView | null =
    open && openPlace
      ? {
          index: open.index,
          key: openPlace.key,
          title: openPlace.title,
          story: openPlace.story,
          rivalStory:
            input.rival && hasTrail(run) && tier === RIVAL_FORK.tier && openPlace.key === RIVAL_FORK.key ? rivalStory(input.rival) : null,
          banter: banterFor(tier, open.index, copies, run.id, road),
          options: forkOptions(tier, open.index, copies, choiceSheet(run.forks, run.choices), road, weather),
          opensAt: open.opensAt.toISOString(),
          closesAt: open.closesAt.toISOString(),
          last: open.index === places.length - 1,
        }
      : null;

  const edges: EdgeView[] = abilitySheet(copies).map((entry) => ({
    copyId: entry.copyId,
    title: entry.ability.title,
    kind: entry.ability.kind,
    does: entry.ability.does,
    counts: run.rules >= ARCHETYPE_RULES && entry.counts,
  }));

  // The next change: a line coming due, a fork opening or closing, home.
  let nextAt: string | null = null;
  if (!run.claimedAt) {
    const after = now.getTime();
    const candidates = [
      ...written.map((entry) => entry.at.getTime()),
      ...forks.flatMap((fork) => [fork.opensAt.getTime(), fork.closesAt.getTime()]),
      end,
    ].filter((at) => Number.isFinite(at) && at > after);
    if (candidates.length > 0) nextAt = new Date(Math.min(...candidates)).toISOString();
  }

  return {
    runId: run.id,
    tier,
    asOf: now.toISOString(),
    startedAt: run.startedAt,
    resolvesAt: run.resolvesAt,
    weather,
    road: placeViews,
    journal,
    nextAt,
    openFork,
    edges,
    company: { rivals, ghosts },
    storms,
    reveal: revealOffer(run, placeViews, now, input),
    tent: Math.max(0, Math.floor(input.camp?.tent ?? 0)),
  };
}

/** The reveal button, when it belongs on the card at all. */
function revealOffer(run: ExpeditionRun, road: PlaceView[], now: Date, input: RunViewInput): RevealOffer | null {
  const reveals = input.reveals;
  if (reveals === null) return null;
  if (run.claimedAt !== null || run.tier === "lost" || run.forks <= 0 || road.length === 0) return null;
  if (Date.parse(run.resolvesAt) <= now.getTime()) return null;
  // Nothing left ahead: every checkpoint is reached, and the RPC would
  // refuse the spend ('road already walked').
  if (road.every((place) => place.known && place.revealedBy === "walked")) return null;
  const offer = (state: RevealState, reason: string | null): RevealOffer => ({ state, fragments: REVEAL_FRAGMENTS, available: state === "ready", reason });
  if (reveals.paid) return offer("paid", "You revealed this road — every checkpoint is on the map.");
  if (reveals.partner) return offer("partner", `${input.partnerName ?? "Your convoy partner"} revealed this road for the convoy.`);
  if (road.every((place) => place.known)) return offer("known", "The squad already knows the rest of the road.");
  if (typeof input.fragments === "number" && input.fragments < REVEAL_FRAGMENTS) {
    return offer("short", `Takes ${REVEAL_FRAGMENTS} map fragment${REVEAL_FRAGMENTS === 1 ? "" : "s"} — you have none to spend.`);
  }
  return offer("ready", null);
}

// === every run on the board ==================================================

export interface RunViewsInput {
  /** The collector's runs as the page reads them, `company` and `weather`
   *  attached. Only the ones in the field get a view. */
  runs: ExpeditionRun[];
  /** The collector's copies — at least every card on a run in the field. */
  copies: CardCopy[];
  now: Date;
  /** fetchReveals' answer; null when it could not be read. */
  reveals: RevealReads | null;
  convoys?: Record<number, ConvoyView>;
  /** The Legendary route's next opponents, by run id. */
  rivals?: Record<number, string>;
  camp?: { tent: number } | null;
  fragments?: number | null;
  landmarks?: LandmarkRef[];
}

/** Whether a run is on the board's Zone C: out, and not a lost card's hold. */
export function inField(run: Pick<ExpeditionRun, "tier" | "claimedAt">): boolean {
  return run.tier !== "lost" && run.claimedAt === null;
}

/**
 * One view per run in the field, keyed by run id — what the page hands the
 * board in place of the road and the company. Serialisable: strings,
 * numbers, booleans and arrays of them.
 */
export function buildRunViews(input: RunViewsInput): Record<number, RunView> {
  const byId = new Map(input.copies.map((copy) => [copy.id, copy]));
  const views: Record<number, RunView> = {};
  for (const run of input.runs) {
    if (!inField(run)) continue;
    const copies = run.squad.map((id) => byId.get(id)).filter((copy): copy is CardCopy => Boolean(copy));
    const partner = input.convoys?.[run.id]?.partner ?? null;
    views[run.id] = runViewFor({
      run,
      copies,
      now: input.now,
      reveals: input.reveals
        ? { paid: input.reveals.mine.has(run.id), partner: partner !== null && input.reveals.partner.has(partner.runId) }
        : null,
      partnerName: partner?.username ?? null,
      rival: input.rivals?.[run.id] ?? null,
      camp: input.camp ?? null,
      fragments: input.fragments ?? null,
      landmarks: input.landmarks,
    });
  }
  return views;
}

// === a campaign's road =======================================================

/**
 * The places a campaign's next stage will walk, by title — the Campaigns
 * tab's "The road ahead: The flooded works → The dog pits". A campaign's
 * road is handed down, so a squad that walks it knows it before it sets
 * out (reveal.ts, `campaign`); only the titles leave the server, never the
 * table they come from. Empty once the campaign is finished, or when its
 * next stage draws a road of its own.
 */
export function campaignRoadTitles(campaign: Pick<CampaignState, "key" | "stage" | "road"> | null): string[] {
  const next = campaign ? nextTier(campaign) : null;
  if (!campaign || !next || !campaign.road || campaign.road.length === 0) return [];
  return forksFor(next, { runId: 0, rules: ROAD_RULES, places: campaign.road }).map((fork) => fork.title);
}
