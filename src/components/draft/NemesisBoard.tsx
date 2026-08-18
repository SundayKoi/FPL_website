"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { errDetail, type NemesisPick, type Team } from "@/lib/draft/types";
import { DIVISIONS, type Division } from "@/lib/schedule/types";
import { nemesisState } from "@/lib/draft/nemesis";

/** Post-auction division draft. Renders from picks alone; the parent owns the
 *  realtime subscription that keeps them fresh. */
export default function NemesisBoard({
  draftId,
  teams,
  picks,
  myTeamId,
  isAdmin,
  onError,
}: {
  draftId: string;
  teams: Team[];
  picks: NemesisPick[];
  myTeamId: string | null;
  isAdmin: boolean;
  onError: (msg: string) => void;
}) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [seedTeam, setSeedTeam] = useState("");
  const [seedDivision, setSeedDivision] = useState<Division>("Lunari");

  const state = nemesisState(teams, picks);
  const onTheClock = teams.find((t) => t.id === state.onTheClockTeamId) ?? null;
  const myTurn = !!myTeamId && state.onTheClockTeamId === myTeamId;
  const canPick = state.phase === "live" && (myTurn || isAdmin);

  const run = async (fn: () => PromiseLike<{ error: unknown }>) => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) onError(errDetail(error));
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "—";

  return (
    <section className="card-brand flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="label-dash">Nemesis draft</h2>
        {state.phase === "live" && onTheClock && (
          // One text node, not styled spans: Testing Library's getByText only
          // sees an element's direct text children, so a split sentence is
          // unassertable without brittle container matching.
          <p className="type-display text-base not-italic text-gold">
            {`${onTheClock.name} is on the clock — their pick goes to ${state.nextDivision}`}
          </p>
        )}
        {state.phase === "complete" && (
          <p className="type-display text-base not-italic text-gold">Nemesis draft complete</p>
        )}
      </div>

      {state.phase === "not_started" &&
        (isAdmin ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-steel">
              First team
              <select
                value={seedTeam}
                onChange={(e) => setSeedTeam(e.target.value)}
                className="input-brand px-2 py-1 text-sm"
              >
                <option value="">— select team —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-steel">
              Starting division
              <select
                value={seedDivision}
                onChange={(e) => setSeedDivision(e.target.value as Division)}
                className="input-brand px-2 py-1 text-sm"
              >
                {DIVISIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || !seedTeam}
              onClick={() =>
                run(() =>
                  supabase.rpc("nemesis_start", {
                    p_draft_id: draftId,
                    p_team_id: seedTeam,
                    p_division: seedDivision,
                  })
                )
              }
              className="btn-coral px-3 py-1.5 text-xs"
            >
              Start nemesis draft
            </button>
          </div>
        ) : (
          <p className="text-sm text-steel">Nemesis draft hasn&apos;t started yet.</p>
        ))}

      {state.phase !== "not_started" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DIVISIONS.map((division) => (
            <div key={division} className="rounded border border-line bg-navy/40 p-3">
              <h3 className="label-dash mb-2">{division}</h3>
              <ul className="flex flex-col gap-1">
                {state.byDivision[division].map((t) => (
                  <li key={t.id} className="text-sm text-white">
                    {t.name}
                  </li>
                ))}
                {state.byDivision[division].length === 0 && (
                  <li className="text-sm text-steel">Empty</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}

      {canPick && state.nextDivision && (
        <div className="flex flex-col gap-2">
          <h3 className="label-dash">
            {myTurn ? "Your pick" : `Picking for ${onTheClock?.name ?? ""}`}
          </h3>
          <div className="flex flex-wrap gap-2">
            {state.unplaced.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    supabase.rpc("nemesis_pick", {
                      p_draft_id: draftId,
                      p_chosen_team_id: t.id,
                    })
                  )
                }
                className="btn-pill text-sm disabled:opacity-40"
              >
                Send {t.name} to {state.nextDivision}
              </button>
            ))}
          </div>
        </div>
      )}

      {picks.length > 0 && (
        <ol className="flex flex-col gap-1 text-xs text-steel">
          {[...picks]
            .sort((a, b) => a.pick_number - b.pick_number)
            .map((p) => (
              <li key={p.id}>
                {p.chooser_team_id
                  ? `${nameOf(p.chooser_team_id)} sent ${nameOf(p.chosen_team_id)} to ${p.division}`
                  : `${nameOf(p.chosen_team_id)} started in ${p.division}`}
              </li>
            ))}
        </ol>
      )}

      {isAdmin && state.phase !== "not_started" && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!confirm("Undo the last nemesis pick?")) return;
              void run(() => supabase.rpc("nemesis_undo", { p_draft_id: draftId }));
            }}
            className="rounded border border-line px-2 py-1 text-xs font-semibold text-steel hover:text-coral disabled:opacity-40"
          >
            Undo last pick
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!confirm("Reset the nemesis draft? Every division is cleared.")) return;
              void run(() => supabase.rpc("nemesis_reset", { p_draft_id: draftId }));
            }}
            className="rounded border border-red-500/60 px-2 py-1 text-xs font-semibold text-red-400 disabled:opacity-40"
          >
            Reset nemesis draft
          </button>
        </div>
      )}
    </section>
  );
}
