"use client";

// The post-match read: the verdict, the three findings, and the
// scoreboard. Every number here came off the stored tape — this
// component computes nothing, it just puts the answer where a player
// will actually look for it.

import type { Autopsy } from "@/lib/gauntlet/autopsy";
import type { PlayerLine } from "@/lib/gauntlet/sim";

function Finding({
  tag,
  finding,
  accent,
}: {
  tag: string;
  finding: NonNullable<Autopsy["closest"]>;
  accent: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel/40 p-4">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: accent }}>
        {tag}
        {finding.clock > 0 ? ` · ${finding.clock}:00` : ""}
      </span>
      <h4 className="type-display text-base leading-snug text-white">{finding.headline}</h4>
      <p className="text-xs leading-5 text-steel">{finding.detail}</p>
      {finding.counter ? (
        <p className="mt-1 border-t border-dashed border-gold/40 pt-2 font-mono text-[11px] leading-4 text-gold">
          ↳ {finding.counter}
        </p>
      ) : null}
    </div>
  );
}

export function AutopsyPanel({ autopsy, won }: { autopsy: Autopsy; won: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div
        className="rounded-xl border p-5"
        style={{
          borderColor: won ? "rgba(46,230,168,.45)" : "rgba(255,107,53,.45)",
          background: won
            ? "linear-gradient(180deg,rgba(46,230,168,.09),rgba(10,42,71,.5))"
            : "linear-gradient(180deg,rgba(255,107,53,.09),rgba(10,42,71,.5))",
        }}
      >
        <span className="label-dash">The read</span>
        <p className="type-display mt-1.5 text-2xl leading-tight text-white sm:text-3xl">{autopsy.verdict}</p>
        <p className="mt-2 max-w-2xl text-sm text-steel">{autopsy.detail}</p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-steel">
          <span>
            fights <b className="text-white">{autopsy.stats.fightsWon}/{autopsy.stats.fightsTotal}</b>
          </span>
          <span>
            checks <b className="text-white">{autopsy.stats.contestsWon}/{autopsy.stats.contestsTotal}</b>
          </span>
          <span>
            lanes <b className="text-white">{autopsy.stats.lanesWon}/5</b>
          </span>
          <span>
            peak <b className="text-mint">+{autopsy.stats.peakGold.toLocaleString()}g</b>
          </span>
          <span>
            avg margin{" "}
            <b className={autopsy.stats.avgMargin >= 0 ? "text-mint" : "text-coral"}>
              {autopsy.stats.avgMargin >= 0 ? "+" : ""}
              {autopsy.stats.avgMargin}
            </b>
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {autopsy.closest ? <Finding tag="Closest call" finding={autopsy.closest} accent="#f5b62e" /> : null}
        {autopsy.swing ? <Finding tag="Biggest swing" finding={autopsy.swing} accent="#35e6ff" /> : null}
        {autopsy.weakLink ? <Finding tag="Weak link" finding={autopsy.weakLink} accent="#ff6b35" /> : null}
      </div>
    </div>
  );
}

export function Scoreboard({ players, mvp }: { players: PlayerLine[]; mvp: string }) {
  const worst = [...players].sort(
    (a, b) => b.contestsLost * 2 + b.deaths - b.contestsWon * 2 - b.kills - (a.contestsLost * 2 + a.deaths - a.contestsWon * 2 - a.kills),
  )[0];
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="bg-black/25 text-[10px] uppercase tracking-[0.16em] text-steel">
            <th className="px-3 py-2 font-semibold">Role</th>
            <th className="px-3 py-2 font-semibold">Card</th>
            <th className="px-3 py-2 text-right font-semibold">K / D / A</th>
            <th className="px-3 py-2 text-right font-semibold">Gold</th>
            <th className="px-3 py-2 font-semibold">Damage share</th>
            <th className="px-3 py-2 text-right font-semibold">Checks</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const isWorst = worst && player.role === worst.role && player.contestsLost > player.contestsWon;
            return (
              <tr key={player.role} className="border-t border-line/50">
                <td className="px-3 py-2 text-steel">{player.role}</td>
                <td className="px-3 py-2">
                  <span className={player.name === mvp ? "font-semibold text-gold" : "text-white"}>{player.name}</span>
                  {player.name === mvp ? <span className="ml-1.5 text-[10px] text-gold">MVP</span> : null}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {player.kills} / {player.deaths} / {player.assists}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-steel">
                  {player.gold.toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-[7px] rounded-[1px]"
                      style={{
                        width: `${Math.max(4, player.damageShare * 2)}px`,
                        background: isWorst ? "#ff6b35" : "#35e6ff",
                      }}
                    />
                    <span className="font-mono tabular-nums text-steel">{player.damageShare}%</span>
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  <span className="text-mint">{player.contestsWon}</span>
                  <span className="text-steel"> · </span>
                  <span className={player.contestsLost > player.contestsWon ? "text-coral" : "text-steel"}>
                    {player.contestsLost}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
