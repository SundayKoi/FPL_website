// The rules of the road: every way an expedition can pay a card and every
// way it can cost one, on the page where the choice is made.
//
// Hook-free and server-renderable. Every number is imported from the
// config that enforces it (the packs/config → perks.ts discipline), so the
// page cannot promise a three-day bench while the RPC writes four.

import { fmtPoints } from "@/lib/betting/format";
import { MUTATIONS } from "@/lib/cards/mutations";
import {
  ECHO_CHANCE,
  EXPEDITION_TIERS,
  INSURANCE_FEE,
  INSURANCE_PER_WEEK,
  PATRON_INSURANCE_PER_WEEK,
  MERCHANT_DOLLARS,
  SURGE_BONUS,
  LOST_DAYS,
  RANSOM_BASE,
  RANSOM_PER_SHINE,
  TIER_ORDER,
  WOUNDED_HOURS,
  payoutRange,
  type ExpeditionTierDef,
  type RouteRisk,
} from "@/lib/expeditions/config";
import {
  CACHE_LOOT,
  CURSED_AGAIN_LOST,
  SCOUTED_CAMP_RISK,
  VETERAN_HOLD_LOOT,
  DEAD_NEEDS_PUSHES,
  FRAGMENT_CHANCE,
  GHOST_HAUNT,
  GHOST_HAUNT_FLOOR,
  HOLD_LOOT,
  RIVAL_LOSS_LOOT,
  RIVAL_WIN_LOOT,
  ROADS,
  ROLE_CALLS,
  SHRINE_RISK,
  TOLL_LOOT,
} from "@/lib/expeditions/routes";
import { HUNTER_FRAGMENT_CHANCE, ROAD_ENCOUNTER_CHANCE, STORM_HOURS, STRANDED_BOUNTY } from "@/lib/expeditions/journal";
import { MILES_BY_TIER, TRAIL_TITLES, WAYFARER_SHINE } from "@/lib/expeditions/trail";
import { WEATHERS } from "@/lib/expeditions/weather";
import { ACCOLADES, ACCOLADE_ORDER } from "@/lib/expeditions/standings";

export const RISK_LABEL: Record<RouteRisk, string> = {
  none: "Nothing can be hurt",
  wounded: "Cards can be wounded",
  lost: "Cards can be lost",
  dead: "Cards can DIE",
};

export const RISK_CLASS: Record<RouteRisk, string> = {
  none: "border-mint/50 text-mint",
  wounded: "border-gold/60 text-gold",
  lost: "border-coral/70 text-coral",
  dead: "border-red-500/80 bg-red-500/10 text-red-300",
};

/** "12 shine · 1 foil" — the gates a tier actually applies. */
export function requirementLine(def: ExpeditionTierDef): string {
  const parts: string[] = [];
  if (def.patron) parts.push("patrons only");
  if (def.minShine > 0) parts.push(`${def.minShine} shine`);
  if (def.minFoils > 0) parts.push(`${def.minFoils} foil${def.minFoils === 1 ? "" : "s"}`);
  if (def.minSigned > 0) parts.push(`${def.minSigned} signed`);
  if (def.fragments > 0) parts.push(`${def.fragments} map fragments`);
  if (def.fee > 0) parts.push(`${fmtPoints(def.fee)} fee`);
  return parts.length === 0 ? "Anyone can run it" : parts.join(" · ");
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** How many distinct places a route can stop at, across its checkpoints
 *  — the number that says "no two runs walk the same road". */
function placesOn(tier: keyof typeof ROADS): number {
  return ROADS[tier].reduce((sum, slot) => sum + slot.length, 0);
}

/** Where a mutation can come from on the road, read off the tables so
 *  the sentence cannot drift from the odds. */
function mutationSources(): string {
  const found: string[] = [];
  for (const tier of TIER_ORDER) {
    for (const slot of ROADS[tier]) {
      for (const fork of slot) {
        if (fork.pushReward) found.push(`${fork.pushReward.mutation} by pushing ${fork.title.toLowerCase()} (${EXPEDITION_TIERS[tier].label}, ${pct(fork.pushReward.chance)})`);
        if (fork.campReward) found.push(`${fork.campReward.mutation} by camping at ${fork.title.toLowerCase()} (${EXPEDITION_TIERS[tier].label}, ${pct(fork.campReward.chance)})`);
        if (fork.campRisk.haunted > 0) found.push(`haunted by camping at ${fork.title.toLowerCase()} (${EXPEDITION_TIERS[tier].label}, ${pct(fork.campRisk.haunted)})`);
      }
    }
  }
  return found.join("; ");
}

export default function ExpeditionRules({ id = "expedition-rules" }: { id?: string }) {
  const woundedDays = WOUNDED_HOURS / 24;
  const raidPlaces = placesOn("raid");
  const legendaryPlaces = placesOn("legendary");
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      data-testid="expedition-rules"
      className="card-brand flex flex-col gap-6 border-gold/40 p-5 sm:p-6"
    >
      <div>
        <span className="label-dash text-gold">Read before you send anyone</span>
        <h2 id={`${id}-title`} className="type-display mt-1 text-2xl sm:text-3xl">
          The rules of the road
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-steel">
          A run is a route with checkpoints. At each one the squad stops and asks you what to do, and what you
          say decides what they bring back and whether they all come back. Nothing here is hidden: the ladder
          below says what every run risks, every fork says what it risks before you answer, and the launch
          button names the cards that can be hurt.
        </p>
      </div>

      {/* ── The ladder ─────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <caption className="sr-only">Every run: how long, how many forks, what it takes, what it pays, what it risks</caption>
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.14em] text-steel">
              <th className="py-2 pr-3 font-semibold">Run</th>
              <th className="py-2 pr-3 font-semibold">Away</th>
              <th className="py-2 pr-3 font-semibold">Forks</th>
              <th className="py-2 pr-3 font-semibold">Entry</th>
              <th className="py-2 pr-3 font-semibold">Pays</th>
              <th className="py-2 font-semibold">Worst case</th>
            </tr>
          </thead>
          <tbody>
            {TIER_ORDER.map((key) => {
              const def = EXPEDITION_TIERS[key];
              const range = payoutRange(key);
              return (
                <tr key={key} className="border-t border-line/70 align-top">
                  <td className="py-2 pr-3 font-semibold text-white">{def.label}</td>
                  <td className="py-2 pr-3 font-mono text-steel">{def.durationHours}h</td>
                  <td className="py-2 pr-3 font-mono text-steel">{def.forks}</td>
                  <td className="py-2 pr-3 text-steel">{requirementLine(def)}</td>
                  <td className="py-2 pr-3 font-mono text-mint">
                    {range.max === 0 ? "nothing" : `${fmtPoints(range.min)}–${fmtPoints(range.max)}`}
                  </td>
                  <td className="py-2">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${RISK_CLASS[def.risk]}`}>
                      {RISK_LABEL[def.risk]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── The patrons' road ─────────────────────────────────────── */}
      <div
        data-testid="rule-gilded"
        className="flex flex-col gap-1 rounded-lg border border-gold/50 bg-gold/10 p-3 text-sm text-steel"
      >
        <h4 className="text-sm font-bold text-gold">The Gilded Road — patrons only</h4>
        <p>
          A route of its own for patrons: {EXPEDITION_TIERS.gilded.durationHours / 24} days, {EXPEDITION_TIERS.gilded.forks} forks, and{" "}
          <strong className="text-white">{EXPEDITION_TIERS.gilded.minSigned} signed cards</strong> in the squad to set out — the hardest
          gate on the board, and the biggest bag: {fmtPoints(payoutRange("gilded").min)}–{fmtPoints(payoutRange("gilded").max)} on the
          base rate, before shine, the brief and the forks. Worst case wounded; nothing on it can lose a card. The forks, the
          odds and the payouts of every other run are exactly what they are for everyone.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ── Forks ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 text-sm text-steel">
          <h3 className="type-display text-lg text-white">How a fork works</h3>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>
              The run pauses at evenly spaced checkpoints. A {EXPEDITION_TIERS.raid.durationHours}h Deep Raid stops at 8h
              and 16h; each fork waits for an answer until the next checkpoint, then the run moves on.
            </li>
            <li>
              <strong className="text-white">The road is drawn when you launch.</strong> Each checkpoint is one of several places
              — a Deep Raid can stop at {raidPlaces} of them across its two forks, the Legendary route at {legendaryPlaces} across its
              four — so two runs on the same route rarely walk the same road. The places at one checkpoint carry the same
              odds as each other; what changes is what is there and what pushing means.
            </li>
            <li>
              <strong className="text-white">Silence is safe.</strong> If you do not answer, the squad camps. Nobody
              loses a card because they were asleep. You get a ping in Discord and a badge on the Play tab when a
              fork opens.
            </li>
            <li>
              <strong className="text-white">Push</strong> adds to the loot and rolls a harm on one card. <strong className="text-white">Camp</strong> keeps what you have.
              Every fork prints its own odds on the button before you press it.
            </li>
            <li>
              A push can turn up more than loot: some forks carry a chance of a <strong className="text-white">map fragment</strong> or a{" "}
              <strong className="text-white">free pack</strong> in the haul. And the careful way is not always the free way — a{" "}
              <strong className="text-white">toll</strong> fork can cost {pct(TOLL_LOOT)} of the loot for camping, and one checkpoint
              rewards a night held with a mutation. The button says which.
            </li>
            <li>
              <strong className="text-white">A run remembers itself.</strong> A toll paid at one fork is good for the next gate too. A
              Jungle&apos;s scout at one fork means the squad knows where not to sleep at the next: its camp risks are rolled at{" "}
              {pct(SCOUTED_CAMP_RISK)} of their odds, and the journal names the place ahead hours before the squad reaches it.
            </li>
            <li>
              Your cards unlock more: a <strong className="text-white">signed card</strong> can call in a favour (push with no
              risk, once a run), a <strong className="text-white">foil</strong> can light a dark fork (push at half the risk), and{" "}
              <strong className="text-white">three from one roster</strong> can rally (double the loot, half again the risk).
            </li>
            <li>
              Some forks are <strong className="text-white">warned</strong>: the squad tells you not to. Push anyway and have it go
              wrong, and the card comes home Cursed.
            </li>
          </ul>
        </div>

        {/* ── Harm ──────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 text-sm text-steel">
          <h3 className="type-display text-lg text-white">How a card gets hurt</h3>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>
              <strong className="text-gold">Wounded.</strong> The card comes home but sits out expeditions and Gauntlet
              lineups for {woundedDays} days. The lightest harm, and the only one a Deep Raid or the Gilded Road can do.
            </li>
            <li>
              <strong className="text-coral">Lost.</strong> The card does not come home. It stays in your collection, locked,
              for {LOST_DAYS} days: mount a <strong className="text-white">Rescue</strong> with another squad, or pay a{" "}
              <strong className="text-white">ransom</strong> ({fmtPoints(RANSOM_BASE)} plus {RANSOM_PER_SHINE} per point of the card&apos;s
              shine). Do neither and it is gone for good. Only a Legend Hunt, a Rescue or the Legendary route can lose a card.
            </li>
            <li>
              <strong className="text-red-300">Dead.</strong> Only on the Legendary route, and only once the squad has pushed{" "}
              {DEAD_NEEDS_PUSHES} forks. There is no rescue from dead. The card goes to the graveyard on this page.
            </li>
            <li>
              A <strong className="text-white">one-roster</strong> Legend Hunt squad that is ignored at two forks is lost as one:
              the chemistry that helps you is the same thing that sinks you.
            </li>
            <li>
              A <strong className="text-white">Cursed</strong> card sent out again on a route that can lose it has a {pct(CURSED_AGAIN_LOST)} chance of
              not coming back.
            </li>
            <li>
              <strong className="text-white">Insurance</strong> ({fmtPoints(INSURANCE_FEE)} at launch) turns lost into wounded and dead
              into lost. {INSURANCE_PER_WEEK} policy a week; patrons get {PATRON_INSURANCE_PER_WEEK}, the first of them free.
            </li>
            <li>
              <strong className="text-white">Never at risk:</strong> an Eclipse, a moment, a champions relic or a team plate cannot board a
              route where it could be lost. The launch refuses them.
            </li>
          </ul>
        </div>
      </div>

      {/* ── The weather ──────────────────────────────────────────── */}
      <div data-testid="rule-weather" className="flex flex-col gap-2 rounded-lg border border-line bg-panel/60 p-3 text-sm text-steel">
        <h3 className="type-display text-lg text-white">The weather — one condition a week, league-wide</h3>
        <p>
          Every Eastern Monday the road gets its weather, posted with the brief here and in the Monday drop. It changes which
          squad is right to send this week without touching a single odds table, and{" "}
          <strong className="text-white">a run keeps the weather it launched under</strong>.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {Object.values(WEATHERS).map((sky) => (
            <li key={sky.key} data-testid={`rule-weather-${sky.key}`} className="flex flex-col gap-1 rounded-md border border-line bg-black/30 p-2.5">
              <span className="text-sm font-semibold text-white">
                <span aria-hidden>{sky.glyph} </span>
                {sky.label}
              </span>
              <span className="text-xs">{sky.does.join(" ")}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Season standings ─────────────────────────────────────── */}
      <div data-testid="rule-standings" className="flex flex-col gap-2 rounded-lg border border-line bg-panel/60 p-3 text-sm text-steel">
        <h3 className="type-display text-lg text-white">Season standings — the roads, scored</h3>
        <p>
          Every claimed run counts: the miles the route is worth, the dollars it brought home, a Legendary route brought home
          whole, the rivals beaten to a spot. When staff close the season the top of each standing is marked, for good:
        </p>
        <ul className="grid gap-2 sm:grid-cols-3">
          {ACCOLADE_ORDER.map((kind) => (
            <li key={kind} data-testid={`rule-mark-${kind}`} className="flex flex-col gap-1 rounded-md border border-line bg-black/30 p-2.5">
              <span className="text-sm font-semibold" style={{ color: ACCOLADES[kind].accent }}>
                {ACCOLADES[kind].glyph} {ACCOLADES[kind].label}
              </span>
              <span className="text-xs">{ACCOLADES[kind].does}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs">Marks only. No dollars change hands at season close — the standings are a reason to go out, never a grind.</p>
      </div>

      {/* ── Company on the road ──────────────────────────────────── */}
      <div data-testid="rule-company" className="flex flex-col gap-2 rounded-lg border border-line bg-panel/60 p-3 text-sm text-steel">
        <h3 className="type-display text-lg text-white">Company on the road — the other people in it</h3>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            <strong className="text-white">A rival squad is a real one.</strong> When the trail puts another squad on your road, it is
            another collector&apos;s run on the same route — the one that launched closest before yours met it, within a day.
            The spot goes to the squad with <strong className="text-white">more shine</strong>; a tie is a coin. Win and the bag is{" "}
            {pct(RIVAL_WIN_LOOT)} heavier, lose and it is {pct(RIVAL_LOSS_LOOT)} lighter, and both journals say who. Nobody else
            on the road? Then the cairn where they would have stood holds a cache: {pct(CACHE_LOOT)} more.
          </li>
          <li>
            <strong className="text-white">The dead walk.</strong> A card that fell on the Legendary route haunts the Legend Hunt and
            the Legendary route for everyone, all season, by name. Camp at the next fork and the haunting is rolled at{" "}
            {GHOST_HAUNT}× the fork&apos;s odds and never under {pct(GHOST_HAUNT_FLOOR)}; push through and it cannot follow. Carry a card in
            the dead card&apos;s old team colours and the ghost stands aside — and leaves a cache: {pct(CACHE_LOOT)} more.
          </li>
          <li>
            <strong className="text-white">Rivalries</strong> are kept on this page for the season: who your squads have beaten to a
            spot, and who has beaten yours.
          </li>
        </ul>
      </div>

      {/* ── Role calls ───────────────────────────────────────────── */}
      <div data-testid="rule-roles" className="flex flex-col gap-2 rounded-lg border border-gold/40 bg-gold/5 p-3 text-sm text-steel">
        <h3 className="type-display text-lg text-white">The role calls — what each position can do at a fork</h3>
        <p>
          Beyond camp and push, every role the league prints has a call of its own, <strong className="text-white">once a run</strong>,
          shaped like the job that role does in the actual game. A squad with a Top, a Jungle and a Support has three of
          these to spend across its forks; a squad of three Mids has one. The button only appears when the role is there —
          the fork says which calls you are missing.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {ROLE_CALLS.map((call) => (
            <li key={call.choice} data-testid={`rule-call-${call.choice}`} className="flex flex-col gap-1 rounded-md border border-line bg-panel/60 p-2.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">{call.role}</span>
              <span className="text-sm font-semibold text-white">{call.label}</span>
              <span className="text-xs">{call.tease}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs">
          A hold is a camp — it keeps what you have, plus {pct(HOLD_LOOT)}, and none of the things that can happen to a
          camper (a wound, a haunting, a toll) happen to a Top on the checkpoint. The other four are pushes: they add the
          fork&apos;s loot and roll its harm, in the shape the role gives it. A scout&apos;s harm lands on the Jungle. A roam&apos;s
          is rolled on two cards. A kite takes half the loot for a quarter of the risk. A ward halves the lost and dead
          rolls and leaves the wound roll alone. None of them works at the Scouting Run&apos;s coin flip. In a convoy a hold
          counts as a camp, and a camp on either side camps the convoy.
        </p>
      </div>

      {/* ── Trail miles ──────────────────────────────────────────── */}
      <div data-testid="rule-miles" className="flex flex-col gap-2 rounded-lg border border-line bg-panel/60 p-3 text-sm text-steel">
        <h3 className="type-display text-lg text-white">Trail miles — a card remembers the roads it has walked</h3>
        <p>
          Every card that comes home alive is stamped with the run&apos;s miles:{" "}
          {TIER_ORDER.filter((key) => MILES_BY_TIER[key] > 0)
            .map((key) => `${EXPEDITION_TIERS[key].label} ${MILES_BY_TIER[key]}`)
            .join(", ")}
          . An Exorcism is a rite, not a road. Miles survive a wound and a mutation, and a card that dies takes them to the
          graveyard. Three titles, and a card holds the highest it has reached:
        </p>
        <ul className="grid gap-2 sm:grid-cols-3">
          {TRAIL_TITLES.map((title) => (
            <li key={title.key} data-testid={`rule-title-${title.key}`} className="flex flex-col gap-1 rounded-md border border-line bg-black/30 p-2.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: title.accent }}>
                {title.miles} miles
              </span>
              <span className="text-sm font-semibold text-white">{title.label}</span>
              <span className="text-xs">{title.does}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs">
          Only the card making the call has to be the Veteran — a Veteran Jungle does not make the Top better — and with
          two cards in a role the one with more miles makes it. A Veteran Top&apos;s hold pays {pct(VETERAN_HOLD_LOOT)}. A
          Wayfarer&apos;s {WAYFARER_SHINE} shine is a reason to send it again, never a way past a gate.
        </p>
      </div>

      {/* ── Mutations ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="type-display text-lg text-white">What a card can come home as</h3>
          <p className="text-sm text-steel">
            One mutation per copy, permanent, drawn on the card everywhere it shows. Each one changes the card in
            Fantasy, in the Gauntlet and on the market. An Exorcism removes Haunted or Cursed; nothing removes the
            rest.
          </p>
        </div>
        <div
          data-testid="rule-fragments"
          className="flex flex-col gap-1 rounded-lg border border-purple-300/50 bg-purple-500/10 p-3 text-sm text-steel"
        >
          <h4 className="text-sm font-bold text-purple-200">Map fragments — the key to the Legendary route</h4>
          <p>
            You cannot buy one. A fragment comes home with a Legend Hunt: <strong className="text-white">every</strong> Legend
            Hunt jackpot carries one, and {pct(FRAGMENT_CHANCE.legend?.solid ?? 0)} of solid Legend Hunts do. A Deep Raid
            jackpot carries one {pct(FRAGMENT_CHANCE.raid?.jackpot ?? 0)} of the time. A few forks can turn one up on a push,
            and a relic hunter met on the trail has one to trade {pct(HUNTER_FRAGMENT_CHANCE)} of the time. They stack in your
            supplies (the purple counter above the brief) and never expire. <strong className="text-white">{EXPEDITION_TIERS.legendary.fragments} fragments</strong> are
            spent to open one Legendary route; the route itself never drops one.
          </p>
        </div>
        <div data-testid="rule-trail" className="flex flex-col gap-2 rounded-lg border border-line bg-panel/60 p-3 text-sm text-steel">
          <h4 className="text-sm font-bold text-white">On the trail — what happens between the forks</h4>
          <p>
            Every run draws its route as a map with the squad moving along it, and keeps a journal that fills in as
            the hours pass — the route&apos;s own lines, and one from each card in the voice of the role it plays, none of
            them repeated inside a run. Between checkpoints, each leg has a {pct(ROAD_ENCOUNTER_CHANCE)} chance of an
            encounter. None of them asks you anything:
          </p>
          <ul className="flex flex-col gap-1 pl-4 [list-style:disc]">
            <li>
              <strong className="text-white">A merchant</strong> pays a flat {fmtPoints(MERCHANT_DOLLARS)} on top of whatever the run
              brings home.
            </li>
            <li>
              <strong className="text-white">A storm</strong> holds the squad up {STORM_HOURS} hours. The clock on the run moves with
              it, and so does every fork after it.
            </li>
            <li>
              <strong className="text-white">A cache</strong> left by an earlier expedition: {pct(CACHE_LOOT)} more loot.
            </li>
            <li>
              <strong className="text-white">A rival squad</strong> on the same trail. Beat them to the spot and it is {pct(RIVAL_WIN_LOOT)} more
              loot; lose the race and it is {pct(RIVAL_LOSS_LOOT)} less. The journal says which, the moment it happens.
            </li>
            <li>
              <strong className="text-white">A shrine</strong> at the roadside: the next fork&apos;s harm is rolled at{" "}
              {pct(SHRINE_RISK)} of its odds if you push there.
            </li>
            <li>
              <strong className="text-white">A relic hunter</strong> trading maps — {pct(HUNTER_FRAGMENT_CHANCE)} of the time they have a
              fragment.
            </li>
            <li>
              <strong className="text-white">A stranded card</strong> — only on a route that can lose one. The squad finds another
              collector&apos;s lost card and carries it home: they get it back wounded, you are paid a{" "}
              {fmtPoints(STRANDED_BOUNTY)} bounty by the house. Your own lost cards never come home this way.
            </li>
          </ul>
          <p>
            At each fork one of the squad has a word to say — a teammate vouching, a signed card offering the
            favour, a foil at a dark fork, a Jungle wanting to scout it. It is colour, not a hint: the odds on the buttons are the truth.{" "}
            <strong className="text-white">A squad already in the field when a rule changes keeps the rules it left with.</strong>
          </p>
        </div>
        <div data-testid="rule-convoy" className="flex flex-col gap-1 rounded-lg border border-gold/40 bg-gold/5 p-3 text-sm text-steel">
          <h4 className="text-sm font-bold text-gold">Convoys — two squads, one set of forks</h4>
          <p>
            Start a convoy at launch and you get a code. A partner joins the <strong className="text-white">same route</strong> with it
            before your first fork opens, and their squad rides your clock: every fork opens and closes for both of you at
            once, and both squads walk the <strong className="text-white">same road</strong> — the places are drawn for the convoy, not
            for each run. You each answer your own forks, and a fork <strong className="text-white">pushes only if you both push</strong> — a
            camp, a hold, or silence, on either side camps the convoy. Each squad still rolls its own loot and its own harm, so
            your partner&apos;s bad night is theirs. The channel hears every answer, with a mention for whoever still has to
            decide. A convoy nobody joins is just your run. Convoys meet everything on the trail but storms.
          </p>
        </div>
        <div
          data-testid="rule-matchday"
          className="grid gap-3 rounded-lg border border-mint/40 bg-mint/5 p-3 text-sm text-steel sm:grid-cols-2"
        >
          <div className="flex flex-col gap-1">
            <h4 className="text-sm font-bold text-mint">Match day</h4>
            <p>
              On a day a team plays, its cards bring home <strong className="text-white">{pct(SURGE_BONUS)} more</strong> from any
              run — one card of theirs on the squad is enough, and it stacks with the brief and the forks. Scored
              against the day you launch, like the brief; the banner above says who is on tonight.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <h4 className="text-sm font-bold text-gold">The echo</h4>
            <p>
              A <strong className="text-white">moment</strong> carried on a run has a {pct(ECHO_CHANCE)} chance to echo: the route drops
              a copy of a card from the game that moment happened in, either side, from that week&apos;s edition.
              A moment is never at risk out there — this is what it is for.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {MUTATIONS.map((mutation) => (
            <article
              key={mutation.key}
              data-testid={`rule-${mutation.key}`}
              className="flex flex-col gap-1.5 rounded-lg border border-line bg-panel/60 p-3 text-xs text-steel"
              style={{ borderColor: `${mutation.accent}55` }}
            >
              <h4 className="text-sm font-bold" style={{ color: mutation.accent }}>
                {mutation.label}
              </h4>
              <p className="text-white">{mutation.source}</p>
              <p>
                <span className="font-semibold text-white">Fantasy:</span> {mutation.fantasy}
              </p>
              <p>
                <span className="font-semibold text-white">Gauntlet:</span> {mutation.gauntlet}
              </p>
              <p>
                <span className="font-semibold text-white">Market:</span> {mutation.economy}
              </p>
            </article>
          ))}
        </div>
        <p className="text-xs text-steel">
          Where each comes from: {mutationSources()}; cursed by pushing a warned fork and having it go wrong; voidtouched by
          coming home from the Legendary route at all.
        </p>
      </div>
    </section>
  );
}
