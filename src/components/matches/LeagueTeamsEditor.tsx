"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { LeagueTeam } from "@/lib/matches/types";
import type { League } from "@/lib/captain/league";

interface TeamForm {
  name: string;
  abbreviation: string;
  active: boolean;
}

const EMPTY_FORM: TeamForm = { name: "", abbreviation: "", active: true };

function formFor(team: LeagueTeam): TeamForm {
  return { name: team.name, abbreviation: team.abbreviation, active: team.active };
}

function validate(form: TeamForm): string | null {
  if (!form.name.trim()) return "Enter a team name.";
  const abbr = form.abbreviation.trim();
  if (abbr.length < 1 || abbr.length > 5) return "Abbreviation must be 1–5 characters.";
  return null;
}

type RowStatus = { kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string };

/**
 * Admin panel on /captain: the canonical league_teams list (this is the
 * table match reporting/codes/rosters all key off — name must match
 * raw_stats.team_name exactly). Editable name/abbreviation/active per row,
 * add row, delete row. `teams` (the row set itself) comes straight from the
 * server-fetched prop, which refreshes after every mutation via
 * router.refresh(); `edits` only overlays in-progress, unsaved field values
 * on top of that so a newly added/removed row just works without any manual
 * resync. See task-6-brief.md ("LeagueTeamsEditor").
 */
export default function LeagueTeamsEditor({ teams, league = "premier" }: { teams: LeagueTeam[]; league?: League }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [edits, setEdits] = useState<Record<string, TeamForm>>({});
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
  const [addForm, setAddForm] = useState<TeamForm>(EMPTY_FORM);
  const [addStatus, setAddStatus] = useState<RowStatus>({ kind: "idle" });

  const formForRow = (team: LeagueTeam): TeamForm => edits[team.id] ?? formFor(team);
  const patchRow = (team: LeagueTeam, patch: Partial<TeamForm>) => {
    setEdits((e) => ({ ...e, [team.id]: { ...formForRow(team), ...patch } }));
    setRowStatus((s) => ({ ...s, [team.id]: { kind: "idle" } }));
  };

  const handleSave = async (team: LeagueTeam) => {
    const form = formForRow(team);
    const invalid = validate(form);
    if (invalid) {
      setRowStatus((s) => ({ ...s, [team.id]: { kind: "error", message: invalid } }));
      return;
    }
    setRowStatus((s) => ({ ...s, [team.id]: { kind: "saving" } }));
    const { error } = await supabase
      .from("league_teams")
      .update({ name: form.name.trim(), abbreviation: form.abbreviation.trim().toUpperCase(), active: form.active })
      .eq("id", team.id);
    if (error) {
      setRowStatus((s) => ({ ...s, [team.id]: { kind: "error", message: error.message } }));
      return;
    }
    setEdits((e) => {
      const next = { ...e };
      delete next[team.id];
      return next;
    });
    setRowStatus((s) => ({ ...s, [team.id]: { kind: "idle" } }));
    router.refresh();
  };

  const handleDelete = async (team: LeagueTeam) => {
    if (!confirm(`Delete "${team.name}"? This cannot be undone.`)) return;
    setRowStatus((s) => ({ ...s, [team.id]: { kind: "saving" } }));
    const { error } = await supabase.from("league_teams").delete().eq("id", team.id);
    if (error) {
      // Verbatim DB error -- e.g. a foreign key violation when a report,
      // roster membership, or code set still references this team -- per
      // the brief, not rewritten into friendlier copy.
      setRowStatus((s) => ({ ...s, [team.id]: { kind: "error", message: error.message } }));
      return;
    }
    setRowStatus((s) => {
      const next = { ...s };
      delete next[team.id];
      return next;
    });
    router.refresh();
  };

  const handleAdd = async () => {
    const invalid = validate(addForm);
    if (invalid) {
      setAddStatus({ kind: "error", message: invalid });
      return;
    }
    setAddStatus({ kind: "saving" });
    const { error } = await supabase.from("league_teams").insert({
      name: addForm.name.trim(),
      abbreviation: addForm.abbreviation.trim().toUpperCase(),
      active: addForm.active,
      league,
    });
    if (error) {
      setAddStatus({ kind: "error", message: error.message });
      return;
    }
    setAddForm(EMPTY_FORM);
    setAddStatus({ kind: "idle" });
    router.refresh();
  };

  return (
    <div className="card-brand overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="label-dash">Admin — league teams ({teams.length})</span>
        <span aria-hidden="true" className="text-steel">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-line px-4 py-4">
          {teams.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-steel">
                    <th className="py-1 pr-3 font-semibold">Name</th>
                    <th className="py-1 pr-3 font-semibold">Abbr.</th>
                    <th className="py-1 pr-3 font-semibold">Active</th>
                    <th className="py-1 font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {teams.map((team) => {
                    const form = formForRow(team);
                    const status = rowStatus[team.id] ?? { kind: "idle" };
                    const busy = status.kind === "saving";
                    return (
                      <tr key={team.id}>
                        <td className="py-1.5 pr-3">
                          <input
                            value={form.name}
                            disabled={busy}
                            aria-label={`${team.name} name`}
                            onChange={(e) => patchRow(team, { name: e.target.value })}
                            className="w-full rounded border border-line bg-navy px-2 py-1 text-white focus:border-gold focus:outline-none disabled:opacity-50"
                          />
                        </td>
                        <td className="py-1.5 pr-3">
                          <input
                            value={form.abbreviation}
                            disabled={busy}
                            maxLength={5}
                            aria-label={`${team.name} abbreviation`}
                            onChange={(e) => patchRow(team, { abbreviation: e.target.value.toUpperCase() })}
                            className="w-20 rounded border border-line bg-navy px-2 py-1 uppercase text-white focus:border-gold focus:outline-none disabled:opacity-50"
                          />
                        </td>
                        <td className="py-1.5 pr-3">
                          <input
                            type="checkbox"
                            checked={form.active}
                            disabled={busy}
                            aria-label={`${team.name} active`}
                            onChange={(e) => patchRow(team, { active: e.target.checked })}
                            className="h-4 w-4 accent-gold"
                          />
                        </td>
                        <td className="py-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleSave(team)}
                              className="rounded-full border border-line bg-panel px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-steel hover:text-white disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleDelete(team)}
                              className="rounded-full border border-red-400/40 bg-red-500/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-red-400 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                          {status.kind === "error" && (
                            <p role="alert" className="mt-1 max-w-xs whitespace-pre-wrap text-xs text-red-400">
                              {status.message}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
            <label className="flex flex-col gap-1 text-xs text-steel">
              New team name
              <input
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                className="rounded border border-line bg-navy px-2 py-1.5 text-sm text-white focus:border-gold focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-steel">
              Abbr.
              <input
                value={addForm.abbreviation}
                onChange={(e) => setAddForm((f) => ({ ...f, abbreviation: e.target.value.toUpperCase() }))}
                maxLength={5}
                className="w-20 rounded border border-line bg-navy px-2 py-1.5 text-sm uppercase text-white focus:border-gold focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-1.5 pb-1.5 text-xs text-steel">
              <input
                type="checkbox"
                checked={addForm.active}
                onChange={(e) => setAddForm((f) => ({ ...f, active: e.target.checked }))}
                className="h-4 w-4 accent-gold"
              />
              Active
            </label>
            <button
              type="button"
              disabled={addStatus.kind === "saving"}
              onClick={() => void handleAdd()}
              className="rounded-full bg-gold px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-navy disabled:opacity-50"
            >
              {addStatus.kind === "saving" ? "Adding…" : "Add team"}
            </button>
          </div>
          {addStatus.kind === "error" && (
            <p role="alert" className="text-sm text-red-400">
              {addStatus.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
