"use client";

// Scouting: who they are, what they're built to do, and how to beat it —
// printed BEFORE you commit to the fight. A modifier you can't see is
// just noise wearing a costume, so traits and the round's condition are
// as public as the enemy's stat line.

import { BOSS_BY_KEY, bossRoundOf } from "@/lib/gauntlet/bosses";
import { CHOICE_BY_KEY } from "@/lib/gauntlet/crossroads";
import { FOE_PLAN_BY_KEY } from "@/lib/gauntlet/foe";
import { BOUNTY_MULT } from "@/lib/gauntlet/ghosts";
import { RELIC_BY_KEY } from "@/lib/gauntlet/relics";
import { CONDITION_BY_KEY, TRAIT_BY_KEY } from "@/lib/gauntlet/traits";
import type { OpponentTeam } from "@/lib/gauntlet/opponents";

export default function ScoutingReport({ opponent }: { opponent: OpponentTeam }) {
  const traits = (opponent.traits ?? []).map((key) => TRAIT_BY_KEY.get(key)).filter(Boolean);
  const condition = CONDITION_BY_KEY.get(opponent.condition ?? "standard");
  const boss = opponent.boss ? BOSS_BY_KEY.get(opponent.boss) : null;
  const plan = opponent.plan ? FOE_PLAN_BY_KEY.get(opponent.plan) : null;
  const ghost = opponent.ghost ?? null;
  const theirCall = ghost?.choiceKey ? CHOICE_BY_KEY.get(ghost.choiceKey) : null;
  return (
    <div className="flex flex-col gap-3">
      {boss ? (
        <div
          className="rounded-xl border border-coral/60 p-4"
          style={{
            background: "linear-gradient(180deg,rgba(255,107,53,.14),rgba(0,0,0,.35))",
            boxShadow: "0 0 34px -16px #ff6b35",
          }}
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-coral">
            ⚠ The wall · round {bossRoundOf(opponent.boss)}
          </span>
          <p className="type-display mt-1 text-2xl text-white sm:text-3xl">{boss.title}</p>
          <p className="mt-1 text-xs italic text-muted">&ldquo;{boss.flavor}&rdquo;</p>
          <p className="mt-2.5 text-sm font-semibold leading-5 text-white">{boss.rule}</p>
          <p className="mt-1.5 font-mono text-[11px] leading-4 text-gold">↳ {boss.counter}</p>
        </div>
      ) : null}
      {ghost ? (
        <div
          className="rounded-xl border border-gold/55 p-4"
          style={{ background: "linear-gradient(180deg,rgba(245,182,46,.12),rgba(0,0,0,.35))" }}
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold">
            {ghost.bounty ? "★ Bounty · one of last week's best" : "A real run · posted last week"}
          </span>
          <p className="type-display mt-1 text-2xl text-white sm:text-3xl">{ghost.name}</p>
          <p className="mt-1 text-xs text-muted">
            Their run scored <b className="text-white">{ghost.score.toLocaleString()}</b> · their shelf averaged{" "}
            <b className="text-white">{ghost.trueAvg}</b>, priced here to the round · their five and their build are
            theirs, the ratings are the bracket&rsquo;s.
          </p>
          {ghost.relics.length > 0 ? (
            <p className="mt-2 flex flex-wrap gap-1.5">
              {ghost.relics.map((key) => (
                <span
                  key={key}
                  className="rounded border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold"
                >
                  {RELIC_BY_KEY.get(key)?.title ?? key}
                </span>
              ))}
            </p>
          ) : (
            <p className="mt-2 text-[11px] italic text-muted">They got here with no relics at all.</p>
          )}
          {ghost.bounty ? (
            <p className="mt-2 rounded border border-gold/50 bg-gold/10 px-2 py-1.5 text-[11px] leading-4 text-gold">
              They finished near the top of last week&rsquo;s board. Beat them and this round pays{" "}
              <b className="text-white">{Math.round(BOUNTY_MULT * 100)}%</b> — you don&rsquo;t get to choose to
              meet a bounty, so this is worth taking risks for.
            </p>
          ) : null}
          {theirCall ? (
            <p className="mt-2.5 font-mono text-[11px] leading-4 text-gold">
              ↳ At this point in their run they called <b className="text-white">{theirCall.choice.label}</b>. They
              will make it again.
            </p>
          ) : null}
        </div>
      ) : null}

      {plan ? (
        <div className="rounded-lg border border-[#ff8896]/45 bg-[#ff8896]/5 p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ff8896]">
            Their game plan · {plan.title}
          </p>
          <p className="mt-1 text-[12px] leading-4 text-white">{plan.tell}</p>
          <p className="mt-1.5 font-mono text-[10.5px] leading-4 text-muted">↳ {plan.counter}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {opponent.cards.map((card) => (
          <div key={card.name} className="w-[104px] rounded-lg border border-[#6b3d47] bg-[#221016] px-2.5 py-2">
            <p className="text-[8px] uppercase tracking-[0.2em] text-muted">{card.role}</p>
            <p className="truncate text-[12px] font-bold text-white">{card.name}</p>
            <p className="font-mono text-sm font-extrabold text-[#ff8896]">{card.overall}</p>
          </div>
        ))}
      </div>

      {traits.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {traits.map((trait) => (
            <div key={trait!.key} className="rounded-lg border border-purple/40 bg-purple/5 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-purple">{trait!.title}</p>
              <p className="mt-1 text-[12px] leading-4 text-white">{trait!.blurb}</p>
              <p className="mt-1.5 font-mono text-[10.5px] leading-4 text-muted">↳ {trait!.counter}</p>
            </div>
          ))}
        </div>
      ) : null}

      {condition && condition.key !== "standard" ? (
        <div className="rounded-lg border border-gold/45 bg-gold/5 p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gold">
            Round condition · {condition.title}
          </p>
          <p className="mt-1 text-[12px] leading-4 text-white">{condition.blurb}</p>
          <p className="mt-1.5 font-mono text-[10.5px] leading-4 text-muted">↳ {condition.tip}</p>
        </div>
      ) : null}
    </div>
  );
}
