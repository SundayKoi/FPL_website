"use client";

import Link from "next/link";
import { useState, type PointerEvent } from "react";
import type { GuessTheCardReveal } from "@/lib/guess-the-card/reveal";

function number(value: number, decimals = 0): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

function percent(value: number): string {
  return `${number(value, 1)}%`;
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/10 py-1.5 text-xs">
      <span className="truncate text-white/65">{label}</span>
      <span className="shrink-0 font-mono font-bold text-white">{value}</span>
    </div>
  );
}

function LockedGroup({ label }: { label: string }) {
  return (
    <section aria-label={`${label} locked`} className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
      <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">🔒 {label}</h4>
      <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/30">Unlock with a miss</p>
    </section>
  );
}

function CombatGroup({ reveal }: { reveal: GuessTheCardReveal }) {
  if (!reveal.combat) return <LockedGroup label="Combat" />;
  return (
    <section aria-label="Combat stats" className="rounded-lg border border-mint/30 bg-mint/10 px-3 py-2">
      <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-mint">Combat</h4>
      <div className="mt-1">
        <StatRow label="K / D / A" value={`${reveal.combat.kills} / ${reveal.combat.deaths} / ${reveal.combat.assists}`} />
        <StatRow label="KDA ratio" value={number(reveal.combat.kda, 2)} />
        <StatRow label="Kill participation" value={percent(reveal.combat.killParticipationPct)} />
      </div>
    </section>
  );
}

function DamageGroup({ reveal }: { reveal: GuessTheCardReveal }) {
  if (!reveal.damage) return <LockedGroup label="Damage" />;
  return (
    <section aria-label="Damage stats" className="rounded-lg border border-coral/30 bg-coral/10 px-3 py-2">
      <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-coral">Damage</h4>
      <div className="mt-1">
        <StatRow label="Total damage" value={number(reveal.damage.total)} />
        <StatRow label="DPM" value={number(reveal.damage.perMin, 1)} />
        <StatRow label="Damage share" value={percent(reveal.damage.sharePct)} />
      </div>
    </section>
  );
}

function EconomyGroup({ reveal }: { reveal: GuessTheCardReveal }) {
  if (!reveal.economy) return <LockedGroup label="Economy" />;
  return (
    <section aria-label="Economy stats" className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2">
      <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-gold">Economy</h4>
      <div className="mt-1">
        <StatRow label="CS / CSPM" value={`${number(reveal.economy.cs)} / ${number(reveal.economy.csPerMin, 1)}`} />
        <StatRow label="Gold / GPM" value={`${number(reveal.economy.gold)} / ${number(reveal.economy.goldPerMin, 1)}`} />
        <StatRow label="At 10 · CS / gold" value={`${number(reveal.economy.csAt10)} / ${number(reveal.economy.goldAt10)}`} />
      </div>
    </section>
  );
}

function FrontFace({ reveal, hidden }: { reveal: GuessTheCardReveal; hidden: boolean }) {
  const final = reveal.final;
  const identity = final ? `${final.name}#${final.tag}` : "?????#????";
  return (
    <div aria-hidden={hidden} className="absolute inset-0 overflow-hidden rounded-[1.1rem] border-2 border-coral/70 bg-gradient-to-br from-coral/25 via-canvas to-cyan/15 p-[5px] [backface-visibility:hidden]">
      <div className="relative flex h-full flex-col overflow-hidden rounded-[0.8rem] bg-canvas/95 p-4">
        {reveal.champion?.artUrl ? (
          // Champion art is intentionally added only after the first miss.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={reveal.champion.artUrl}
            alt={`${reveal.champion.name} splash art`}
            className="absolute inset-0 h-40 w-full object-cover opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent)]"
            decoding="async"
          />
        ) : null}
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <span className="label-dash">GUESS THE CARD</span>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">Daily game</p>
          </div>
          <span className="rounded-full border border-cyan/50 bg-cyan/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan">
            {reveal.role}
          </span>
        </div>

        <div className="relative mt-5 flex min-h-24 items-end justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-2xl font-bold text-white [text-shadow:0_2px_6px_rgb(0_0_0/0.9)]">{identity}</h3>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
              {reveal.champion ? reveal.champion.name : "Champion hidden"}
            </p>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-coral/60 bg-black/45 font-display text-2xl font-black text-white">
            {reveal.stage === "role" ? "?" : reveal.stage === "final" ? "✓" : "…"}
          </div>
        </div>

        <div className="relative mt-4 flex flex-1 flex-col gap-2">
          <CombatGroup reveal={reveal} />
          <DamageGroup reveal={reveal} />
          <EconomyGroup reveal={reveal} />
        </div>

        {final ? (
          <div className="relative mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-white/15 pt-2 text-[10px] text-white/70">
            <span className="truncate">{final.team}</span>
            <span className={`text-right font-bold uppercase ${final.result === "win" ? "text-mint" : "text-coral"}`}>{final.result}</span>
            <span>{final.date} · {final.side}</span>
            <span className="text-right">{number(final.durationMin, 1)} min</span>
          </div>
        ) : (
          <div className="relative mt-3 border-t border-white/15 pt-2 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
            Misses reveal the next rail
          </div>
        )}
      </div>
    </div>
  );
}

function BackFace({ reveal, hidden }: { reveal: GuessTheCardReveal; hidden: boolean }) {
  const back = reveal.cardBack;
  if (!back || !reveal.final) return null;
  return (
    <div aria-hidden={hidden} className="absolute inset-0 overflow-hidden rounded-[1.1rem] border-2 border-gold/70 bg-gradient-to-br from-gold/30 via-canvas to-coral/15 p-[5px] [backface-visibility:hidden] [transform:rotateY(180deg)]">
      <div className="flex h-full flex-col overflow-hidden rounded-[0.8rem] bg-canvas/95 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="label-dash">COMPLETED</span>
            <h3 className="mt-2 font-display text-2xl font-bold text-white">Completed game stats</h3>
          </div>
          <span className="rounded-full bg-gold px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-canvas">{reveal.final.result}</span>
        </div>
        <p className="mt-1 truncate text-xs text-muted">{reveal.final.name}#{reveal.final.tag} · {reveal.final.team}</p>
        <div className="mt-4 grid grid-cols-2 gap-x-4">
          <StatRow label="Vision score" value={number(back.visionScore, 1)} />
          <StatRow label="Objectives" value={number(back.objectives)} />
          <StatRow label="Damage taken" value={number(back.damageTaken)} />
          <StatRow label="Damage mitigated" value={number(back.damageMitigated)} />
          <StatRow label="Healing" value={number(back.healing)} />
          <StatRow label="Solo kills" value={number(back.soloKills)} />
          <StatRow label="Turret damage" value={number(back.turretDamage)} />
          <StatRow label="Objective damage" value={number(back.objectiveDamage)} />
        </div>
        <div className="mt-4 border-t border-white/10 pt-2">
          <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-gold">Multikills</h4>
          <p className="mt-2 font-mono text-xs text-white">
            Double ×{back.multikills.doubles} · Triple ×{back.multikills.triples} · Quadra ×{back.multikills.quadras} · Penta ×{back.multikills.pentas}
          </p>
        </div>
        <div className="mt-auto border-t border-white/15 pt-3 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
          Frozen from the completed game
        </div>
      </div>
    </div>
  );
}

export default function GuessTheCard({ reveal }: { reveal: GuessTheCardReveal }) {
  const [flipped, setFlipped] = useState(false);
  const [glare, setGlare] = useState({ x: 50, y: 50 });
  const canFlip = reveal.canFlip && Boolean(reveal.cardBack);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    setGlare({
      x: Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100)),
    });
  }

  return (
    <div data-testid="guess-the-card-card" role="region" aria-label="Guess the Card player card" className="w-[20rem] max-w-full [perspective:1200px]">
      <div
        className="relative aspect-[5/7] w-full [transform-style:preserve-3d]"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setGlare({ x: 50, y: 50 })}
        style={{ transform: flipped ? "rotateY(180deg)" : undefined, transition: "transform 550ms ease" }}
      >
        <FrontFace reveal={reveal} hidden={flipped} />
        <BackFace reveal={reveal} hidden={!flipped} />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 rounded-[1.1rem] opacity-25 mix-blend-screen transition-[background] duration-150"
          style={{ background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgb(255 255 255 / 0.55), transparent 42%)` }}
        />
        {canFlip ? (
          <button
            type="button"
            className="absolute right-3 top-3 z-20 rounded-full border border-white/30 bg-canvas/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white transition hover:border-gold hover:text-gold"
            onClick={() => setFlipped((current) => !current)}
            aria-label={flipped ? "Show Guess the Card front" : "Show Guess the Card back"}
          >
            {flipped ? "Front" : "Back ↻"}
          </button>
        ) : null}
      </div>
      {reveal.final ? (
        <Link href={`/card/${reveal.final.slug}`} className="mt-3 block text-center text-xs font-bold uppercase tracking-[0.16em] text-coral transition hover:text-white">
          View player card →
        </Link>
      ) : null}
    </div>
  );
}
