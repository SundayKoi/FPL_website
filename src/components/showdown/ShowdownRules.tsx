// The Showdown rulebook panel. Every number here is IMPORTED from the
// game's config and the hand ranking is rendered from the evaluator's own
// table, so what a player reads is what the table enforces. If the game
// changes, this panel is part of the change.

import {
  ACTION_SECONDS,
  BRACKET_KEYS,
  BRACKETS,
  HOLE_CARDS,
  RAKE_CAP_BIG_BLINDS,
  RAKE_PCT,
  SEATS_MAX,
  SEATS_TO_DEAL,
  STACK_SIZE,
  TIMEOUTS_TO_SIT_OUT,
} from "@/lib/showdown/config";
import { HAND_RANKS, ROLES, TIER_ORDER } from "@/lib/showdown/hands";
import { fmtPoints } from "@/lib/betting/format";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <details className="group border-b border-border-subtle/50 py-3 last:border-0">
    <summary className="cursor-pointer list-none text-sm font-bold uppercase tracking-[0.14em] text-white transition group-open:text-coral">
      <span className="mr-2 inline-block text-coral transition group-open:rotate-90">▸</span>
      {title}
    </summary>
    <div className="mt-3 flex flex-col gap-3 pl-5 text-sm leading-6 text-muted">{children}</div>
  </details>
);

const tierLabel = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

export default function ShowdownRules() {
  const rakePct = Math.round(RAKE_PCT * 100);
  return (
    <section aria-label="How Showdown works" className="card-brand flex flex-col p-6">
      <div className="mb-2">
        <span className="label-dash">The rulebook</span>
        <p className="mt-1 text-xs text-muted">
          Hold&apos;em with the cards you collect. Only betting dollars are ever at stake: a card sits at a
          table, it is never won, lost or put up.
        </p>
      </div>

      <Section title="How a hand runs">
        <p>
          It is Texas Hold&apos;em. <b className="text-white">{HOLE_CARDS} hole cards</b> are dealt to you face
          down from your own stack. <b className="text-white">Five community cards</b> come out for everyone,
          three on the flop, one on the turn, one on the river, dealt from this week&apos;s edition — the
          same deck everyone can browse. Four betting rounds, no limit. Best five of seven wins at showdown;
          if everyone else folds, the last player standing takes the pot and never shows.
        </p>
      </Section>

      <Section title="What the cards are">
        <p>
          <b className="text-white">Role</b> ({ROLES.join(", ")}) is the suit: five different roles is a
          straight. <b className="text-white">Team</b> is what pairs: two from one team is a pair, five from
          one team is the whole roster. <b className="text-white">Tier</b> ({TIER_ORDER.map(tierLabel).join(" → ")})
          makes the other straight: five in a row. <b className="text-white">Overall</b> is the rank; it
          settles high card and every tie. <b className="text-white">Foil</b> only matters for the top hand.
        </p>
        <p>
          Two copies of the same player are two different cards, the way two kings are. They pair only
          because they share a team.
        </p>
      </Section>

      <Section title="Hand ranking">
        <p>Weakest first. There is no plain flush: a team has one player per role, so five from one team is already the top straight, and ranks there.</p>
        <ol className="flex flex-col gap-1">
          {HAND_RANKS.map((rank) => (
            <li key={rank.key} className="grid grid-cols-[8rem_1fr] gap-3">
              <b className={rank.key === "foil_royal" ? "text-gold" : "text-white"}>{rank.label}</b>
              <span>
                {rank.takes} <i className="text-steel">({rank.standsIn})</i>
              </span>
            </li>
          ))}
        </ol>
        <p>
          <b className="text-white">Ties.</b> Same kind of hand: compare the overalls of the cards that make it,
          highest first, then the leftovers as kickers. All equal, the pot splits.
        </p>
      </Section>

      <Section title="Sitting down">
        <p>
          A table seats {SEATS_TO_DEAL} to {SEATS_MAX}. You bring dollars to bet with and a stack of{" "}
          <b className="text-white">{STACK_SIZE} cards</b> from your collection, any edition week of the current
          season. Your hole cards each hand are dealt from those {STACK_SIZE} at random.
        </p>
        <ul className="flex flex-col gap-1">
          {BRACKET_KEYS.map((key) => {
            const bracket = BRACKETS[key];
            return (
              <li key={key}>
                <b className="text-white">{bracket.label} table</b> · blinds {fmtPoints(bracket.smallBlind)} /{" "}
                {fmtPoints(bracket.bigBlind)} · buy-in {fmtPoints(bracket.minBuyIn)} to {fmtPoints(bracket.maxBuyIn)} ·
                stack cap {bracket.stackCap} overall
              </li>
            );
          })}
        </ul>
        <p>
          <b className="text-white">The cap.</b> The {STACK_SIZE} overalls added together may not exceed the
          table&apos;s cap. A shelf of Challengers has to bring Bronze and Silver to fit, like everyone else
          — and a Ladder needs five tiers in a row, so the Bronze in your stack is the card that completes it.
        </p>
        <p>
          <b className="text-white">Or take a house stack:</b> {STACK_SIZE} cards dealt from this week&apos;s
          edition, fitted to the cap. Always available, so nobody is outgunned for lack of a collection. Your
          own stack gives you choice, not power.
        </p>
        <p>
          A copy sits at one table at a time. While seated it cannot be listed, traded or dusted; standing
          up releases it.
        </p>
      </Section>

      <Section title="Betting and the clock">
        <p>
          Blinds rotate one seat left each hand; the small blind is half the big. Minimum raise is the size of
          the last raise, or one big blind if nobody has raised. All in is always allowed; side pots form when
          someone cannot cover.
        </p>
        <p>
          You have <b className="text-white">{ACTION_SECONDS} seconds</b> to act. Out of time, you check where
          checking is free and fold otherwise. {TIMEOUTS_TO_SIT_OUT} timeouts in a row and you are sat out until
          you come back.
        </p>
      </Section>

      <Section title="The rake">
        <p>
          <b className="text-white">{rakePct}% of every pot</b> that reaches a flop, capped at{" "}
          {RAKE_CAP_BIG_BLINDS} big blinds, comes off the top before the winner is paid. No flop, no rake. The
          rake is burned: it leaves the economy and goes to nobody.
        </p>
      </Section>

      <Section title="Standing up">
        <p>
          Leave between hands whenever you like; what is in front of you goes back to your wallet and your
          cards are released. Leave mid-hand and that hand folds; the rest comes back after it finishes. A
          table with one player waits for a second. Anyone can watch; hole cards stay hidden until showdown.
        </p>
      </Section>

      <Section title="Never on the line">
        <p>
          Every card ranks by its overall. A signed card, an Eclipse, a Cracked Ice is worth exactly what a
          plain copy of the same player is worth at the table. They are for showing at showdown.
        </p>
        <p>
          Patronage does not touch Showdown: no better cards, no better dealing, no discount on the rake.
        </p>
      </Section>
    </section>
  );
}
