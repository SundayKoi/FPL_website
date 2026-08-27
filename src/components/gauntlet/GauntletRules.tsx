// The rulebook panel: every number the sim rolls, stated in the open.
//
// Data-driven where the data exists (the crossroads catalog renders
// itself), hand-written where the engine's shape is the content. If the
// sim changes, this page is part of the change — the Gauntlet's promise
// is that nothing is rolled that isn't printed here.

import { CROSSROADS_CATALOG } from "@/lib/gauntlet/crossroads";
import { GAUNTLET_ENTRY_FEE } from "@/lib/gauntlet/run";
import { CONDITION_CATALOG, TRAIT_CATALOG } from "@/lib/gauntlet/traits";
import { FRESH_LEGS_BONUS, GAUNTLET_ROUNDS, TRIALIST_OVERALL } from "@/lib/gauntlet/sim";

/** clock · what happens · what's rolled · what moves. */
const BEATS: { clock: string; beat: string; check: string; swing: string }[] = [
  { clock: "0:00", beat: "Draft read", check: "Comp triangle: poke beats dive beats protect beats poke", swing: "±6 momentum" },
  { clock: "8:00", beat: "Lane phase", check: "Role vs role — Top/Mid/Bot roll laning, Jungle rolls presence, Support rolls vision", swing: "±2 momentum per lane, and up to ±680 gold per lane by margin" },
  { clock: "11:00", beat: "Rift Herald", check: "Your objectives + turrets vs their objectives + presence", swing: "±4 momentum · ±520 gold · first turret" },
  { clock: "14:00", beat: "First dragon", check: "Your objectives + presence vs theirs", swing: "±5 momentum · ±320 gold" },
  { clock: "18:00", beat: "The skirmish", check: "Your combat + damage vs theirs", swing: "±8 momentum · ±900 gold" },
  { clock: "20:00", beat: "THE CROSSROADS", check: "Your call — the exact stats and stakes are printed on each choice below", swing: "as staked · ±400 gold" },
  { clock: "23:00", beat: "Soul dragon", check: "Your objectives + presence vs theirs", swing: "±5 momentum · ±450 gold" },
  { clock: "25:00", beat: "THE BARON PIT", check: "A damage race, then a smite check: your objectives + vision vs their objectives + combat", swing: "±9 momentum · ±1,500 gold" },
  { clock: "27:00", beat: "Fight at the pit", check: "Your combat + damage vs theirs, plus your gold lead and the Baron buff", swing: "±8 momentum · ±1,300 gold" },
  { clock: "29:00", beat: "The hold (close games only)", check: "Your survival + turrets vs their damage + objectives", swing: "+6 held / −8 cracked" },
  { clock: "31:00", beat: "Nexus", check: "Momentum + your impact edge + your gold lead — snowballed if you won 3+ lanes", swing: "the game" },
];

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <details className="group border-b border-line/50 py-3 last:border-0">
    <summary className="cursor-pointer list-none text-sm font-bold uppercase tracking-[0.14em] text-white transition group-open:text-coral">
      <span className="mr-2 inline-block text-coral transition group-open:rotate-90">▸</span>
      {title}
    </summary>
    <div className="mt-3 flex flex-col gap-3 pl-5 text-sm leading-6 text-steel">{children}</div>
  </details>
);

export default function GauntletRules() {
  return (
    <section aria-label="How the Gauntlet works" className="card-brand flex flex-col p-6">
      <div className="mb-2">
        <span className="label-dash">The rulebook</span>
        <p className="mt-1 text-xs text-steel">
          Nothing is rolled that isn&apos;t printed here. Every check is your bars against theirs plus honest
          noise — the same numbers the draft screen and the choice cards show you.
        </p>
      </div>

      <Section title="The shape of a run">
        <p>
          Entry is <b className="text-white">{GAUNTLET_ENTRY_FEE} betting dollars</b>, and it&apos;s gone the
          moment you enter — it feeds the week&apos;s pot and nothing refunds it. Draft one card per role and
          climb {GAUNTLET_ROUNDS} rounds. Lose once and the run is over. You can{" "}
          <b className="text-white">walk away</b> from a live run to free the slot for a fresh draft, but
          walking away pays nothing — no refund, no reward; the score you&apos;d already won just stands on the
          board like a fallen run&apos;s. The bracket scales to <i>your</i> lineup&apos;s average: round 1
          starts about eight points under it and round {GAUNTLET_ROUNDS} ends about seven over. Roughly 95% of
          runs clear round 1, half reach round 4, and about 4% clear all eight. A stacked shelf gets a harder
          bracket — the run is about the calls, not the collection.
        </p>
      </Section>

      <Section title="The match, beat by beat">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-[0.16em] text-steel">
                <th className="py-1.5 pr-3 font-semibold">Clock</th>
                <th className="py-1.5 pr-3 font-semibold">Beat</th>
                <th className="py-1.5 pr-3 font-semibold">What&apos;s rolled</th>
                <th className="py-1.5 font-semibold">What moves</th>
              </tr>
            </thead>
            <tbody>
              {BEATS.map((row) => (
                <tr key={row.clock + row.beat} className="border-b border-line/40 last:border-0">
                  <td className="py-2 pr-3 font-mono text-steel">{row.clock}</td>
                  <td className="py-2 pr-3 font-semibold text-white">{row.beat}</td>
                  <td className="py-2 pr-3">{row.check}</td>
                  <td className="py-2 whitespace-nowrap">{row.swing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Every contest reads the <b className="text-white">team average</b> of the named bars (a card missing
          a bar counts a little under its overall), adds relic help and their trait bonuses, then rolls fair
          noise both ways. Fights are symmetric — there is no hidden home-field edge. The tape prints{" "}
          <b className="text-white">your number, their number, the roll and the margin</b> for every one, so a
          loss always says by how much.
        </p>
      </Section>

      <Section title="Comp identities — the triangle">
        <p>
          Your comp identity is <b className="text-white">read from your stats</b>, not declared:
          heavy <b className="text-white">damage + laning</b> reads as poke,
          heavy <b className="text-white">combat + presence</b> reads as dive,
          heavy <b className="text-white">survival + vision</b> reads as protect. The draft read at 0:00 pays
          the triangle — <b className="text-white">poke beats dive, dive beats protect, protect beats poke</b> —
          ±6 momentum before a single wave spawns. Enemy comps are scouted before every fight, so re-check the
          matchup before you lock the fight in.
        </p>
      </Section>

      <Section title="The crossroads — every call on the table">
        <p>
          At 20:00 the scoreboard summons a situation and pauses the game for your call. Every choice is an
          open-book check: which of your bars roll, which of theirs they roll against, what momentum is staked
          either way, and the <b className="text-gold">daring bonus</b> a landed gamble pays your run score.
          The safe play never rolls dice — and never pays daring.
        </p>
        {CROSSROADS_CATALOG.map((situation) => (
          <div key={situation.key} className="rounded-lg border border-line/60 bg-panel/40 p-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white">
              {situation.title}
              <span className="ml-2 font-normal normal-case tracking-normal text-steel">
                momentum {situation.band[0]}–{situation.band[1]}
              </span>
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {situation.choices.map((choice) => (
                <li key={choice.key} className="text-xs">
                  <b className="text-white">{choice.label}</b>
                  {" — "}
                  {choice.yourKeys.length === 0 ? (
                    <>no roll · a sure +{choice.win} momentum, nothing staked, no daring</>
                  ) : (
                    <>
                      your {choice.yourKeys.join(" + ")}
                      {choice.bonus > 0 ? ` (+${choice.bonus})` : ""} vs their {choice.theirKeys.join(" + ")} ·{" "}
                      <span className="text-mint">+{choice.win}</span> /{" "}
                      <span className="text-coral">{choice.lose}</span> momentum ·{" "}
                      <span className="text-gold">+{choice.scoreBonus} daring</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Section>

      <Section title="Gold — the line that decides the late game">
        <p>
          Every beat moves gold, and the graph above the tape is your lead over the clock. Lanes pay by{" "}
          <b className="text-white">margin</b> (a lane won by 20 pays far more than one won by 2), objectives
          and fights pay flat, and the Baron is worth 1,500 on its own. From 20:00 on, your gold lead is worth{" "}
          <b className="text-white">one point of stat per 280 gold</b> — capped at 14 — in the pit fight, the
          hold, and the final call. Winning the lane phase isn&apos;t flavour: it&apos;s the reason the late
          game goes your way.
        </p>
      </Section>

      <Section title="The Baron pit — how close is a real number">
        <p>
          At 25:00 someone starts Baron: you, if you called it at the crossroads or you&apos;re ahead;
          otherwise them, and you&apos;re contesting. It resolves as a race, not a coin flip:
        </p>
        <p>
          Your <b className="text-white">damage and combat</b> set how fast it burns. Your{" "}
          <b className="text-white">vision</b> against their <b className="text-white">presence</b> sets how
          long you get before they arrive — plus a few seconds of luck, because a pit that ran the same
          length every game would be a lookup table. Whatever health is left when they arrive is what the
          smite check is fought over: your <b className="text-white">objectives + vision</b> against their{" "}
          <b className="text-white">objectives + combat</b>, with a +4 edge to whoever started it.
        </p>
        <p>
          Kill it before they get there and it&apos;s a clean take. Otherwise you get the honest answer:{" "}
          <span className="font-mono text-white">&ldquo;their smite lands at 12% — you were 340 damage
          short&rdquo;</span>.
        </p>
      </Section>

      <Section title="Enemy traits — every one is a shape, not a stat stick">
        <p>
          Each enemy team wears traits (one early, three by round 6), rolled with the round and printed on
          the scouting screen before you fight. Every trait pays for its strength somewhere else, so scouting
          changes <em>what you do</em>, not how doomed you are — difficulty lives in the bracket ramp and
          nowhere else.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {TRAIT_CATALOG.map((trait) => (
            <div key={trait.key} className="rounded-lg border border-line/60 bg-panel/40 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-purple">{trait.title}</p>
              <p className="mt-1 text-xs leading-4 text-white">{trait.blurb}</p>
              <p className="mt-1 font-mono text-[10.5px] leading-4 text-steel">↳ {trait.counter}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Round conditions — the patch you play under">
        <p>
          Round 1 is always the standard patch. Every round after rolls a condition that rewrites one rule
          for both sides, so the same lineup wants different relics and different calls round to round.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {CONDITION_CATALOG.filter((condition) => condition.key !== "standard").map((condition) => (
            <div key={condition.key} className="rounded-lg border border-line/60 bg-panel/40 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">{condition.title}</p>
              <p className="mt-1 text-xs leading-4 text-white">{condition.blurb}</p>
              <p className="mt-1 font-mono text-[10.5px] leading-4 text-steel">↳ {condition.tip}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Reading the tape and the autopsy">
        <p>
          The match plays out at its own pace — pause, speed it up, or skip it. Underneath, the{" "}
          <b className="text-white">gold graph</b> draws as the clock runs, and each beat shows a{" "}
          <b className="text-white">margin bar</b>: how far the check landed either side of even.
        </p>
        <p>
          When it ends you get the scoreboard — kills, gold, damage share and checks decided per card — and
          the <b className="text-white">read</b>: the verdict, the closest call you lost (with the relic that
          would have flipped it), the biggest gold swing of the match, and your weak link. All of it is
          computed from the tape you just watched. Nothing is invented after the fact.
        </p>
      </Section>

      <Section title="Fresh Legs, trialists, and the bench">
        <p>
          Cards printed <b className="text-white">this week</b> carry Fresh Legs: +{FRESH_LEGS_BONUS} on every
          bar they roll (TRAINING ARC doubles it). A role your shelf can&apos;t cover fields
          a {TRIALIST_OVERALL}-rated trialist — a warm body that also taxes your score 40 per round. THE SIXTH
          MAN relic allows one mid-run swap between rounds; the bracket stays priced at your entry average, so
          a swap never softens later rounds.
        </p>
      </Section>

      <Section title="Relics — the four families">
        <p>
          After every won round (except the last) you pick <b className="text-white">one of three</b> relics;
          the other two burn. <b style={{ color: "#ff7a3d" }}>Ember</b> runs hot — fights and aggression, often
          at a price. <b style={{ color: "#9b6dff" }}>Void</b> owns the map — objectives, vision, the pit.{" "}
          <b style={{ color: "#a8e6ff" }}>Ice</b> plays the long game — lanes, tempo, the late hold.{" "}
          <b style={{ color: "#e8c14b" }}>Gold</b> pays the board — score and style, never the fight. Effects stack for
          the whole run, and every card states its exact numbers. Foil and ink never touch a fight — shine pays
          score only.
        </p>
      </Section>

      <Section title="Scoring and the weekly pot">
        <p>
          A won round pays <b className="text-white">200 + 55 × round</b> score, plus{" "}
          <b className="text-white">2.4 × every momentum point past 50</b> at the whistle, plus the{" "}
          <b className="text-gold">daring bonus</b> for a landed crossroads gamble, plus shine (foils and
          signatures pay a little score — more with THE SHOWCASE), minus 40 per trialist. Losses pay nothing.{" "}
          <b className="text-white">Score is board points, never dollars</b> — nothing in a run puts money in
          your wallet, and walking away refunds nothing. The only money the Gauntlet ever pays out is
          Monday&apos;s settlement of the pot (every entry fee paid that week):{" "}
          <b className="text-white">40 / 25 / 15%</b> to the week&apos;s top three scores, with scraps for
          everyone who cleared round 4. Best run per player counts.
        </p>
      </Section>
    </section>
  );
}
