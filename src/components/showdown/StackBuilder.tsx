"use client";

// Choosing what to sit down with: ten of your own cards under the cap, or
// a house stack, and a buy-in inside the bracket.

import { useMemo, useState } from "react";
import { fmtPoints } from "@/lib/betting/format";
import { STACK_SIZE, type Bracket } from "@/lib/showdown/config";
import type { StackOption } from "@/lib/showdown/server";
import { editionLabel } from "@/lib/packs/week";

export default function StackBuilder({
  options,
  bracket,
  balance,
  seatNo,
  pending,
  onSit,
  onCancel,
}: {
  options: StackOption[];
  bracket: Bracket;
  balance: number;
  seatNo: number;
  pending: boolean;
  onSit: (input: { seatNo: number; buyIn: number; house: boolean; cardIds: number[] }) => void;
  onCancel: () => void;
}) {
  const [house, setHouse] = useState(options.length < STACK_SIZE);
  const [chosen, setChosen] = useState<number[]>([]);
  const [buyIn, setBuyIn] = useState(Math.min(bracket.minBuyIn, balance));
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => [...options].sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name)), [options]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? sorted.filter((option) => `${option.name} ${option.team}`.toLowerCase().includes(needle)) : sorted;
  }, [sorted, query]);
  const total = chosen.reduce((sum, id) => sum + (options.find((option) => option.id === id)?.overall ?? 0), 0);
  const overCap = total > bracket.stackCap;
  const stackReady = house || (chosen.length === STACK_SIZE && !overCap);
  const buyInOk = Number.isInteger(buyIn) && buyIn >= bracket.minBuyIn && buyIn <= bracket.maxBuyIn && buyIn <= balance;

  const toggle = (id: number) =>
    setChosen((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : current.length < STACK_SIZE ? [...current, id] : current));

  return (
    <section aria-label={`Sit down at seat ${seatNo + 1}`} className="card-brand flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="label-dash">Seat {seatNo + 1} · {bracket.label} table</span>
        <button type="button" onClick={onCancel} className="text-xs text-steel underline-offset-4 hover:text-coral hover:underline">
          Cancel
        </button>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-white">
          <input type="radio" name="stack" checked={!house} disabled={options.length < STACK_SIZE} onChange={() => setHouse(false)} />
          My cards
          {options.length < STACK_SIZE ? <span className="text-xs text-steel">(you need {STACK_SIZE})</span> : null}
        </label>
        <label className="flex items-center gap-2 text-sm text-white">
          <input type="radio" name="stack" checked={house} onChange={() => setHouse(true)} />
          House stack
          <span className="text-xs text-steel">ten from this week&apos;s edition, under the cap</span>
        </label>
      </div>

      {!house ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className={overCap ? "font-semibold text-coral" : "text-steel"}>
              {chosen.length} / {STACK_SIZE} cards · {total} / {bracket.stackCap} overall{overCap ? " — over the cap" : ""}
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a player or team"
              className="rounded-md border border-line bg-black/20 px-2 py-1 text-xs text-white"
            />
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded bg-black/30">
            <div
              className={`h-full ${overCap ? "bg-coral" : "bg-mint"}`}
              style={{ width: `${Math.min(100, (total / bracket.stackCap) * 100)}%` }}
            />
          </div>
          <ul className="grid max-h-72 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
            {shown.map((option) => {
              const on = chosen.includes(option.id);
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => toggle(option.id)}
                    aria-pressed={on}
                    className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1 text-left text-xs ${
                      on ? "border-mint bg-mint/10 text-white" : "border-line text-steel hover:border-coral"
                    }`}
                  >
                    <span className="truncate">
                      <span className="font-semibold text-white">{option.name}</span> · {option.team} · {option.role}
                      <span className="ml-1 text-[10px] uppercase text-steel">{editionLabel(option.week)}</span>
                    </span>
                    <span className="type-display text-sm">{option.overall}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <label className="flex flex-col gap-1 text-xs text-steel">
        Buy-in · {fmtPoints(bracket.minBuyIn)} to {fmtPoints(bracket.maxBuyIn)} · you have {fmtPoints(balance)}
        <input
          type="number"
          min={bracket.minBuyIn}
          max={Math.min(bracket.maxBuyIn, balance)}
          step={bracket.bigBlind}
          value={buyIn}
          onChange={(event) => setBuyIn(Number(event.target.value))}
          className="w-40 rounded-md border border-line bg-black/20 px-3 py-2 text-sm text-white"
        />
      </label>

      <button
        type="button"
        disabled={pending || !stackReady || !buyInOk}
        onClick={() => onSit({ seatNo, buyIn, house, cardIds: house ? [] : chosen })}
        className="btn-pill w-fit px-4 py-1.5 text-xs disabled:opacity-50"
      >
        {pending ? "Sitting down…" : `Sit down with ${fmtPoints(buyIn)}`}
      </button>
    </section>
  );
}
