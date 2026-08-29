"use client";

// Scouting: who they are, what they're built to do, and how to beat it —
// printed BEFORE you commit to the fight. A modifier you can't see is
// just noise wearing a costume, so traits and the round's condition are
// as public as the enemy's stat line.

import { BOSS_BY_KEY, bossRoundOf } from "@/lib/gauntlet/bosses";
import { FOE_PLAN_BY_KEY } from "@/lib/gauntlet/foe";
import { CONDITION_BY_KEY, TRAIT_BY_KEY } from "@/lib/gauntlet/traits";
import type { OpponentTeam } from "@/lib/gauntlet/opponents";

export default function ScoutingReport({ opponent }: { opponent: OpponentTeam }) {
  const traits = (opponent.traits ?? []).map((key) => TRAIT_BY_KEY.get(key)).filter(Boolean);
  const condition = CONDITION_BY_KEY.get(opponent.condition ?? "standard");
  const boss = opponent.boss ? BOSS_BY_KEY.get(opponent.boss) : null;
  const plan = opponent.plan ? FOE_PLAN_BY_KEY.get(opponent.plan) : null;
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
          <p className="mt-1 text-xs italic text-steel">&ldquo;{boss.flavor}&rdquo;</p>
          <p className="mt-2.5 text-sm font-semibold leading-5 text-white">{boss.rule}</p>
          <p className="mt-1.5 font-mono text-[11px] leading-4 text-gold">↳ {boss.counter}</p>
        </div>
      ) : null}
      {plan ? (
        <div className="rounded-lg border border-[#ff8896]/45 bg-[#ff8896]/5 p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ff8896]">
            Their game plan · {plan.title}
          </p>
          <p className="mt-1 text-[12px] leading-4 text-white">{plan.tell}</p>
          <p className="mt-1.5 font-mono text-[10.5px] leading-4 text-steel">↳ {plan.counter}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {opponent.cards.map((card) => (
          <div key={card.name} className="w-[104px] rounded-lg border border-[#6b3d47] bg-[#221016] px-2.5 py-2">
            <p className="text-[8px] uppercase tracking-[0.2em] text-steel">{card.role}</p>
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
              <p className="mt-1.5 font-mono text-[10.5px] leading-4 text-steel">↳ {trait!.counter}</p>
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
          <p className="mt-1.5 font-mono text-[10.5px] leading-4 text-steel">↳ {condition.tip}</p>
        </div>
      ) : null}
    </div>
  );
}
