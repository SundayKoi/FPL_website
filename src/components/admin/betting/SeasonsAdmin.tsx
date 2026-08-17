"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSeason, closeSeason } from "@/lib/betting/admin-actions";

export interface SeasonRow {
  id: number;
  name: string;
  status: "ACTIVE" | "CLOSED";
  started_at: string;
  closed_at: string | null;
}

export default function SeasonsAdmin({ seasons }: { seasons: SeasonRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [resetTo, setResetTo] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasActive = seasons.some((s) => s.status === "ACTIVE");

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          startTransition(async () => {
            const result = await createSeason(name.trim());
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setError(null);
            setName("");
            router.refresh();
          });
        }}
        className="card-brand flex flex-wrap items-end gap-2 p-4"
      >
        <label className="flex flex-col gap-1 text-xs text-steel">
          New season name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Season 3"
            disabled={hasActive}
            className="rounded border border-line bg-navy px-2 py-1.5 text-sm text-white placeholder:text-steel/60 focus:border-coral focus:outline-none disabled:opacity-40"
          />
        </label>
        <button
          type="submit"
          disabled={pending || !name.trim() || hasActive}
          title={hasActive ? "Close the active season first" : undefined}
          className="rounded bg-coral px-4 py-2 text-sm font-display font-bold not-italic text-navy hover:brightness-110 disabled:opacity-40"
        >
          Start season
        </button>
      </form>

      <div className="flex flex-col gap-2">
        <h2 className="label-dash">Seasons ({seasons.length})</h2>
        {seasons.length === 0 ? (
          <p className="text-sm text-steel">No seasons yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {seasons.map((s) => (
              <li key={s.id} className="card-brand flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium text-white">{s.name}</span>
                  <span className="text-xs text-steel">
                    {s.status} · started {new Date(s.started_at).toLocaleDateString()}
                    {s.closed_at ? ` · closed ${new Date(s.closed_at).toLocaleDateString()}` : ""}
                  </span>
                </div>
                {s.status === "ACTIVE" && (
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-steel">
                      Reset balances to
                      <input
                        type="number"
                        min={0}
                        value={resetTo}
                        onChange={(e) => setResetTo(Math.max(0, Number(e.target.value) || 0))}
                        className="w-24 rounded border border-line bg-navy px-2 py-1 text-sm text-white focus:border-coral focus:outline-none"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        const msg =
                          resetTo > 0
                            ? `Close "${s.name}" and reset every wallet to ${resetTo}? This cannot be undone.`
                            : `Close "${s.name}" and keep every wallet's current balance?`;
                        if (!confirm(msg)) return;
                        startTransition(async () => {
                          const result = await closeSeason(s.id, resetTo);
                          if (!result.ok) {
                            setError(result.error);
                            return;
                          }
                          setError(null);
                          router.refresh();
                        });
                      }}
                      className="rounded border border-red-500/60 px-2 py-1 text-xs font-semibold text-red-400 disabled:opacity-40"
                    >
                      Close season
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
