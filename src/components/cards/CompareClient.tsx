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
    <label className="flex flex-col gap-1 text-xs text-muted">
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

/** One line of the table. A bar the other card doesn't carry comes through
 *  as null — printed as a dash, and never scored as a loss. */
interface CompareRow {
  key: string;
  label: string;
  a: number | null;
  b: number | null;
}

/**
 * The two cards' stat bars, matched by KEY rather than by position.
 *
 * Which five bars a card wears depends on its role (src/lib/cards/
 * measures.ts), so a jungler and an ADC do not carry the same set. Zipping
 * by index printed the jungler's "Objectives" label beside the ADC's
 * Damage number — confidently wrong, which is worse than missing. Rows
 * follow the left card's order, then pick up any bar only the right card
 * has, so nothing is silently dropped. Copies frozen in card_inventory with
 * the retired form/clutch keys line up by the same rule.
 */
function statRows(cardA: PlayerCardData, cardB: PlayerCardData): CompareRow[] {
  const bByKey = new Map(cardB.subStats.map((stat) => [stat.key, stat]));
  const aKeys = new Set(cardA.subStats.map((stat) => stat.key));
  return [
    ...cardA.subStats.map((stat) => ({
      key: stat.key,
      label: stat.label,
      a: stat.value,
      b: bByKey.get(stat.key)?.value ?? null,
    })),
    ...cardB.subStats
      .filter((stat) => !aKeys.has(stat.key))
      .map((stat) => ({ key: stat.key, label: stat.label, a: null, b: stat.value })),
  ];
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

  const rows: CompareRow[] = cardA && cardB
    ? [
        { key: "overall", label: "Overall", a: cardA.overall, b: cardB.overall },
        ...statRows(cardA, cardB),
        { key: "winrate", label: "Win rate", a: Math.round(cardA.winratePct), b: Math.round(cardB.winratePct) },
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
                // Only a row both cards actually have can be won.
                const comparable = row.a !== null && row.b !== null;
                const aWins = comparable && (row.a as number) > (row.b as number);
                const bWins = comparable && (row.b as number) > (row.a as number);
                return (
                  <tr key={row.key} className="border-b border-border/60">
                    <td className={`py-1.5 pr-2 text-right font-mono font-bold ${aWins ? "text-mint" : "text-muted"}`}>
                      {row.a ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {row.label}
                    </td>
                    <td className={`py-1.5 pl-2 text-left font-mono font-bold ${bWins ? "text-mint" : "text-muted"}`}>
                      {row.b ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <PlayerCard3D card={cardB} />
        </div>
      ) : (
        <p className="text-sm text-muted">Pick two players to put their cards head to head.</p>
      )}
    </div>
  );
}
