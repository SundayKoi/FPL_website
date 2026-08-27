// The rulebook panel: every number the sim rolls, stated in the open.
//
// Data-driven where the data exists (the crossroads catalog renders
// itself), hand-written where the engine's shape is the content. If the
// sim changes, this page is part of the change — the Gauntlet's promise
// is that nothing is rolled that isn't printed here.

import { CROSSROADS_CATALOG } from "@/lib/gauntlet/crossroads";
import { GAUNTLET_ENTRY_FEE } from "@/lib/gauntlet/run";
import { FRESH_LEGS_BONUS, GAUNTLET_ROUNDS, TRIALIST_OVERALL } from "@/lib/gauntlet/sim";

/** clock · what happens · what's rolled · what moves. */
const BEATS: { clock: string; beat: string; check: string; swing: string }[] = [
  { clock: "0:00", beat: "Draft read", check: "Comp triangle: poke beats dive beats protect beats poke", swing: "±6 momentum" },
  { clock: "8:00", beat: "Lane phase", check: "Role vs role — Top/Mid/Bot roll laning, Jungle rolls presence, Support rolls vision", swing: "±2 momentum per lane off even (LANE KINGDOM amplifies)" },
  { clock: "14:00", beat: "First dragon", check: "Your objectives + presence vs theirs", swing: "±5 momentum" },
  { clock: "18:00", beat: "The skirmish", check: "Your combat + damage vs theirs", swing: "±8 momentum" },
  { clock: "20:00", beat: "THE CROSSROADS", check: "Your call — the exact stats and stakes are printed on each choice below", swing: "as staked" },
  { clock: "23:00", beat: "Soul dragon", check: "Your objectives + presence vs theirs", swing: "±5 momentum" },
  { clock: "26:00", beat: "Baron pit fight", check: "Your combat + damage vs theirs", swing: "±8 momentum" },
  { clock: "28:00", beat: "The hold (close games only)", check: "Your survival + turrets vs their damage + objectives", swing: "+6 held / −8 cracked" },
  { clock: "30:00", beat: "Nexus", check: "Momentum + your impact edge — snowballed if you won 3+ lanes", swing: "the game" },
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
          Entry is <b className="text-white">{GAUNTLET_ENTRY_FEE} betting dollars</b>. Draft one card per role
          and climb {GAUNTLET_ROUNDS} rounds. Lose once and the run is over — score kept, nothing banked extra.
          Between rounds you can <b className="text-white">retreat</b> and bank your score instead of fighting
          on. The bracket scales to <i>your</i> lineup&apos;s average: round 1 starts about four points under
          it, round {GAUNTLET_ROUNDS} ends about seven over. A stacked shelf gets a harder bracket — the run is
          about the calls, not the collection.
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
          a bar counts a little under its overall), adds any relic help, and rolls fair noise both ways. Fights
          are symmetric — there is no hidden home-field edge.
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
          <b style={{ color: "#e8c14b" }}>Gold</b> pays the board — score, style, the bank. Effects stack for
          the whole run, and every card states its exact numbers. Foil and ink never touch a fight — shine pays
          score only.
        </p>
      </Section>

      <Section title="Scoring and the weekly pot">
        <p>
          A won round pays <b className="text-white">200 + 55 × round</b>, plus{" "}
          <b className="text-white">2.4 × every momentum point past 50</b> at the whistle, plus the{" "}
          <b className="text-gold">daring bonus</b> for a landed crossroads gamble, plus shine (foils and
          signatures pay a little score — more with THE SHOWCASE), minus 40 per trialist. Losses pay nothing.
          Retreating banks your score as it stands (THE BANKER adds 15% on the way out). Every entry fee feeds
          the week&apos;s pot: Monday it pays <b className="text-white">40 / 25 / 15%</b> to the top three
          scores, with scraps for everyone who cleared round 4. Best run per player counts.
        </p>
      </Section>
    </section>
  );
}
