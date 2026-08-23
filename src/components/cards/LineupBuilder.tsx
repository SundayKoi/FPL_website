"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CardLeague } from "@/lib/cards/queries";
import { submitLineupAction } from "@/lib/fantasy/actions";
import { FANTASY_ROLES, SALARY_CAP, type FantasyRole } from "@/lib/fantasy/config";
import { validateLineup, type LineupSlotInput } from "@/lib/fantasy/validate";

/** An owned copy, reduced to what the picker needs — a plain object so the
 *  server page can hand it across the boundary without the full card json. */
export interface LineupInventoryOption {
  id: number;
  slug: string;
  playerName: string;
  role: string;
  overall: number;
  editionWeek: string;
  foil: boolean;
}

export type LineupSelection = Record<FantasyRole, number | null>;

const EMPTY: LineupSelection = { Top: null, Jungle: null, Mid: null, Bot: null, Support: null };

/** "Aug 24" for a `YYYY-MM-DD` Monday. Explicit locale + UTC so the server
 *  and client render the same string (weeks are UTC-Monday by definition). */
function monthDay(weekStart: string): string {
  return new Date(`${weekStart}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function optionLabel(card: LineupInventoryOption): string {
  return `${card.playerName} — ${card.overall} OVR · WK ${monthDay(card.editionWeek)}${card.foil ? " ✦" : ""}`;
}

function countdown(lockAtIso: string, now: number): string {
  const left = new Date(lockAtIso).getTime() - now;
  if (left <= 0) return "Locked";
  const secs = Math.floor(left / 1000);
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

/** Ticking time-to-lock. Starts as null and fills in on the client so the
 *  server-rendered HTML never carries a stamp that's stale by hydration —
 *  the same reason LockCountdown reads the clock in an effect. */
function useCountdown(lockAtIso: string): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setLabel(countdown(lockAtIso, Date.now()));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [lockAtIso]);
  return label;
}

/**
 * Weekly lineup form: one owned card per role, under the salary cap.
 *
 * The cap meter and the inline error come from the same `validateLineup`
 * the server action runs — this is a preview of the verdict, never the
 * verdict itself, which is why Submit stays enabled for cap/duplicate
 * problems the user can still see explained.
 */
export default function LineupBuilder({
  league,
  week,
  lockAtIso,
  inventory,
  initialSlots,
}: {
  league: CardLeague;
  week: string;
  lockAtIso: string;
  inventory: LineupInventoryOption[];
  initialSlots?: LineupSelection;
}) {
  const router = useRouter();
  const [slots, setSlots] = useState<LineupSelection>({ ...EMPTY, ...initialSlots });
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lockIn = useCountdown(lockAtIso);

  const byId = useMemo(() => new Map(inventory.map((card) => [card.id, card])), [inventory]);

  /** Owned cards for each role, one entry per distinct printing: two
   *  identical copies are interchangeable, so listing both would only make
   *  the dropdown longer. A copy that is already fielded always survives
   *  the dedupe, so the select can show what was saved. */
  const optionsByRole = useMemo(() => {
    const chosen = new Set(Object.values(slots).filter((id): id is number => id !== null));
    const map = {} as Record<FantasyRole, LineupInventoryOption[]>;
    for (const role of FANTASY_ROLES) {
      const seen = new Map<string, LineupInventoryOption>();
      for (const card of inventory) {
        if (card.role !== role) continue;
        const key = `${card.slug}|${card.overall}|${card.editionWeek}|${card.foil}`;
        const kept = seen.get(key);
        if (!kept || (chosen.has(card.id) && !chosen.has(kept.id))) seen.set(key, card);
      }
      map[role] = [...seen.values()].sort(
        (a, b) => b.overall - a.overall || a.playerName.localeCompare(b.playerName),
      );
    }
    return map;
  }, [inventory, slots]);

  const picked: LineupSlotInput[] = FANTASY_ROLES.flatMap((role) => {
    const card = slots[role] === null ? undefined : byId.get(slots[role]!);
    return card ? [{ role, inventory: card }] : [];
  });
  const complete = picked.length === FANTASY_ROLES.length;
  const totalOverall = picked.reduce((sum, slot) => sum + slot.inventory.overall, 0);
  const overCap = totalOverall > SALARY_CAP;
  const verdict = complete ? validateLineup(picked) : null;
  const preview = verdict && !verdict.ok ? verdict.error : null;

  function submit() {
    setError(null);
    setMsg(null);
    startTransition(async () => {
      const result = await submitLineupAction(league, slots as Record<FantasyRole, number>);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMsg(`Lineup locked in for the week of ${monthDay(result.weekStart)}.`);
      router.refresh();
    });
  }

  if (inventory.length === 0) {
    return (
      <div className="card-brand p-5 text-sm text-steel">
        You don&apos;t own any cards yet — open a pack to start building a lineup.
      </div>
    );
  }

  return (
    <div className="card-brand p-5" data-testid="lineup-builder">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="type-display text-2xl">Week of {monthDay(week)}</h2>
        <span className="text-xs text-steel">
          {lockIn === "Locked" ? "Locked" : lockIn ? <>Locks in <b className="text-white">{lockIn}</b></> : " "}
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {FANTASY_ROLES.map((role) => {
          const options = optionsByRole[role];
          return (
            <label key={role} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-steel">{role}</span>
              <select
                className="input-brand min-w-0 flex-1 p-2 text-sm"
                value={slots[role] ?? ""}
                disabled={pending}
                onChange={(e) =>
                  setSlots((prev) => ({ ...prev, [role]: e.target.value === "" ? null : Number(e.target.value) }))
                }
              >
                <option value="">
                  {options.length === 0 ? `No ${role} cards owned` : `Pick a ${role}…`}
                </option>
                {options.map((card) => (
                  <option key={card.id} value={card.id}>
                    {optionLabel(card)}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <span className={`font-mono text-sm font-bold ${overCap ? "text-red-400" : "text-mint"}`}>
          {totalOverall}/{SALARY_CAP}
        </span>
        <span className="text-xs text-steel">salary cap</span>
        <button
          type="button"
          className="btn-coral ml-auto px-4 py-2 text-sm"
          disabled={pending || !complete}
          onClick={submit}
        >
          {pending ? "Saving…" : "Submit lineup"}
        </button>
      </div>

      {preview && !error && <p className="mt-2 text-xs text-red-400">{preview}</p>}
      {!complete && <p className="mt-2 text-xs text-steel">Fill all five roles to submit.</p>}
      {msg && <p className="mt-2 text-xs text-mint">{msg}</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
