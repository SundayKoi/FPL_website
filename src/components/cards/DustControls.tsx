"use client";

// Dusting: sell a duplicate copy back for betting dollars.
//
// The shelf above shows one entry per player — the best copy — which is
// exactly the wrong granularity for destroying something. So this drawer
// opens the stack: every copy you own of that player, listed individually
// with the print run it came from and what it dusts for, because "dust a
// duplicate" is a decision about a specific copy and the ✍ signed one is
// never the copy you meant.
//
// Two clicks, always. The first arms one copy ("Confirm $25?"), the second
// destroys it — arming any other copy disarms the first, so a stray click
// can't cascade down the list. There is no undo on the other side of this,
// which is the whole reason for the second click.
//
// Locked copies (fielded in a lineup that hasn't been graded) are NOT
// precomputed here: the lineup can change between render and click, so the
// server action is the only thing that can answer honestly and its error is
// surfaced inline instead.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtPoints } from "@/lib/betting/format";
import { dustValueOf } from "@/lib/packs/config";
import { editionLabel } from "@/lib/packs/week";
import { dustCardAction } from "@/lib/trades/actions";

/** One owned copy, flattened to the serializable fields a client component
 *  can be handed across the server/client boundary. */
export interface DustCopy {
  id: number;
  tier: string;
  foil: boolean;
  signed: boolean;
  editionWeek: string;
}

/** "challenger" → "Challenger". The tier labels in src/lib/cards/build.ts are
 *  the capitalized key, so there is nothing to look up. */
function tierLabel(tier: string): string {
  return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : "—";
}

export default function DustControls({ playerName, copies }: { playerName: string; copies: DustCopy[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (copies.length === 0) return null;

  function toggle() {
    setOpen((wasOpen) => !wasOpen);
    setArmed(null);
    setError(null);
  }

  function handleDust(copy: DustCopy) {
    setError(null);
    if (armed !== copy.id) {
      setArmed(copy.id); // first click only arms — nothing is destroyed yet
      return;
    }
    setArmed(null);
    startTransition(async () => {
      const result = await dustCardAction(copy.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The grid is server-rendered, so the shelf only learns the copy is
      // gone on a refresh.
      router.refresh();
    });
  }

  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="text-[10px] font-semibold uppercase tracking-wide text-steel underline-offset-4 hover:text-coral hover:underline"
      >
        {open ? "Hide copies" : "Manage copies"}
      </button>

      {open ? (
        <ul className="flex w-full flex-col gap-1">
          {copies.map((copy) => {
            const value = dustValueOf(copy);
            const isArmed = armed === copy.id;
            return (
              <li
                key={copy.id}
                className="flex items-center justify-between gap-2 rounded-md border border-line bg-panel px-2 py-1"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-1 text-[10px] text-steel">
                  <span className="font-semibold uppercase tracking-wide">{editionLabel(copy.editionWeek)}</span>
                  <span>{tierLabel(copy.tier)}</span>
                  {copy.signed ? (
                    <span className="font-black text-gold" title="Autographed copy">
                      ✍
                    </span>
                  ) : null}
                  {copy.foil ? (
                    <span className="font-black text-gold" title="Foil copy">
                      ✦
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => handleDust(copy)}
                  disabled={pending}
                  aria-label={`Dust the ${editionLabel(copy.editionWeek)} ${tierLabel(copy.tier)} copy of ${playerName}`}
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-60 ${
                    isArmed
                      ? "border-coral bg-coral/20 text-coral"
                      : "border-line text-steel hover:border-coral hover:text-coral"
                  }`}
                >
                  {isArmed ? `Confirm ${fmtPoints(value)}?` : `Dust · ${fmtPoints(value)}`}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {error ? <p className="text-[10px] text-red-400">{error}</p> : null}
    </div>
  );
}
