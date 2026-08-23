"use client";

// Head-to-head card viewer: two pickers, two live cards, and a stat table
// in between with the better number highlighted per row. The selection is
// mirrored into ?a=&b= so a matchup can be linked straight into Discord.

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PlayerCardData } from "@/lib/cards/build";
import PlayerCard3D from "./PlayerCard3D";

function Picker({
  cards,
  value,
  onChange,
  label,
}: {
  cards: PlayerCardData[];
  value: string;
  onChange: (slug: string) => void;
  label: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-steel">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input-brand px-2 py-1.5 text-sm">
        <option value="">Select…</option>
        {cards.map((card) => (
          <option key={card.slug} value={card.slug}>
            {card.name} · {card.overall} OVR{card.teamName ? ` (${card.teamName})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function CompareClient({
  cards,
  initialA,
  initialB,
  basePath = "/cards/compare",
}: {
  cards: PlayerCardData[];
  initialA: string | null;
  initialB: string | null;
  /** The page's own path — the academy compare lives elsewhere. */
  basePath?: string;
}) {
  const router = useRouter();
  const [slugA, setSlugA] = useState(initialA ?? "");
  const [slugB, setSlugB] = useState(initialB ?? "");
  const cardA = cards.find((card) => card.slug === slugA) ?? null;
  const cardB = cards.find((card) => card.slug === slugB) ?? null;

  const update = (a: string, b: string) => {
    setSlugA(a);
    setSlugB(b);
    const params = new URLSearchParams();
    if (a) params.set("a", a);
    if (b) params.set("b", b);
    router.replace(`${basePath}${params.size ? `?${params}` : ""}`, { scroll: false });
  };

  const rows = cardA && cardB
    ? [
        { label: "Overall", a: cardA.overall, b: cardB.overall },
        ...cardA.subStats.map((stat, index) => ({
          label: stat.label,
          a: stat.value,
          b: cardB.subStats[index]?.value ?? 0,
        })),
        { label: "Win rate", a: Math.round(cardA.winratePct), b: Math.round(cardB.winratePct) },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid max-w-xl grid-cols-2 gap-3">
        <Picker cards={cards} value={slugA} onChange={(slug) => update(slug, slugB)} label="Red corner" />
        <Picker cards={cards} value={slugB} onChange={(slug) => update(slugA, slug)} label="Blue corner" />
      </div>

      {cardA && cardB ? (
        <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
          <PlayerCard3D card={cardA} />
          <table className="w-full max-w-xs self-center text-sm" aria-label="Stat comparison">
            <tbody>
              {rows.map((row) => {
                const aWins = row.a > row.b;
                const bWins = row.b > row.a;
                return (
                  <tr key={row.label} className="border-b border-line/60">
                    <td className={`py-1.5 pr-2 text-right font-mono font-bold ${aWins ? "text-mint" : "text-steel"}`}>{row.a}</td>
                    <td className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-steel">
                      {row.label}
                    </td>
                    <td className={`py-1.5 pl-2 text-left font-mono font-bold ${bWins ? "text-mint" : "text-steel"}`}>{row.b}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <PlayerCard3D card={cardB} />
        </div>
      ) : (
        <p className="text-sm text-steel">Pick two players to put their cards head to head.</p>
      )}
    </div>
  );
}
