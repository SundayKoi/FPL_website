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
import { CURSED_AGAIN_LOST, DEAD_NEEDS_PUSHES, FORKS, FRAGMENT_CHANCE } from "@/lib/expeditions/routes";
import { ENCOUNTER_CHANCE, STORM_HOURS, STRANDED_BOUNTY } from "@/lib/expeditions/journal";

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
  if (def.minShine > 0) parts.push(`${def.minShine} shine`);
  if (def.minFoils > 0) parts.push(`${def.minFoils} foil${def.minFoils === 1 ? "" : "s"}`);
  if (def.minSigned > 0) parts.push(`${def.minSigned} signed`);
  if (def.fragments > 0) parts.push(`${def.fragments} map fragments`);
  if (def.fee > 0) parts.push(`${fmtPoints(def.fee)} fee`);
  return parts.length === 0 ? "Anyone can run it" : parts.join(" · ");
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function ExpeditionRules({ id = "expedition-rules" }: { id?: string }) {
  const woundedDays = WOUNDED_HOURS / 24;
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
              <strong className="text-white">Silence is safe.</strong> If you do not answer, the squad camps. Nobody
              loses a card because they were asleep. You get a ping in Discord and a badge on the Play tab when a
              fork opens.
            </li>
            <li>
              <strong className="text-white">Push</strong> adds to the loot and rolls a harm on one card. <strong className="text-white">Camp</strong> keeps what you have.
              Every fork prints its own odds on the button before you press it.
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
              lineups for {woundedDays} days. The lightest harm, and the only one a Deep Raid can do.
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
              <strong className="text-white">Insurance</strong> ({fmtPoints(INSURANCE_FEE)} at launch; a patron&apos;s first policy each week is
              free) turns lost into wounded and dead into lost.
            </li>
            <li>
              <strong className="text-white">Never at risk:</strong> an Eclipse, a moment, a champions relic or a team plate cannot board a
              route where it could be lost. The launch refuses them.
            </li>
          </ul>
        </div>
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
            jackpot carries one {pct(FRAGMENT_CHANCE.raid?.jackpot ?? 0)} of the time. They stack in your supplies (the
            purple counter above the brief) and never expire. <strong className="text-white">{EXPEDITION_TIERS.legendary.fragments} fragments</strong> are
            spent to open one Legendary route; the route itself never drops one.
          </p>
        </div>
        <div data-testid="rule-trail" className="flex flex-col gap-2 rounded-lg border border-line bg-panel/60 p-3 text-sm text-steel">
          <h4 className="text-sm font-bold text-white">On the trail — what happens between the forks</h4>
          <p>
            Every run draws its route as a map with the squad moving along it, and keeps a journal that fills in as
            the hours pass. Between checkpoints, each leg has a {pct(ENCOUNTER_CHANCE)} chance of an encounter. None
            of them asks you anything:
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
              <strong className="text-white">A stranded card</strong> — only on a route that can lose one. The squad finds another
              collector&apos;s lost card and carries it home: they get it back wounded, you are paid a{" "}
              {fmtPoints(STRANDED_BOUNTY)} bounty by the house. Your own lost cards never come home this way.
            </li>
          </ul>
          <p>
            At each fork one of the squad has a word to say — a teammate vouching, a signed card offering the
            favour, a foil at a dark fork. It is colour, not a hint: the odds on the buttons are the truth.{" "}
            <strong className="text-white">A squad already in the field when a rule changes keeps the rules it left with.</strong>
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
          Where each comes from: {FORKS.raid[0].pushReward?.mutation} at the Deep Raid&apos;s reactor ({pct(FORKS.raid[0].pushReward?.chance ?? 0)} on a push),{" "}
          {FORKS.raid[1].pushReward?.mutation} at its brutal fork ({pct(FORKS.raid[1].pushReward?.chance ?? 0)}), haunted by camping at the Legend Hunt&apos;s wrong
          checkpoint ({pct(FORKS.legend[1].campRisk.haunted)}), cursed by pushing a warned fork and having it go wrong, voidtouched by coming home from the Legendary route at all.
        </p>
      </div>
    </section>
  );
}
