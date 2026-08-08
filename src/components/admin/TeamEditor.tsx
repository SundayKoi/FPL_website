"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ROLE_ORDER, type LolRole, type Player, type Profile, type Team } from "@/lib/draft/types";

export default function TeamEditor({
  draftId,
  teams,
  players,
  profiles,
  onChanged,
}: {
  draftId: string;
  teams: Team[];
  players: Player[];
  profiles: Profile[];
  onChanged: () => void | Promise<void>;
}) {
  const supabase = createClient();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const addTeam = async () => {
    if (busy) return; // guards double-clicks that land before React commits `busy`
    setBusy(true);
    setErr(null);
    // Re-read the current max position right before inserting (rather than
    // trusting the `teams` prop, which can be stale if this fires again
    // before a prior add's refetch has landed) to avoid colliding with the
    // unique (draft_id, nomination_position) constraint.
    const { data: existing } = await supabase
      .from("teams")
      .select("nomination_position")
      .eq("draft_id", draftId)
      .order("nomination_position", { ascending: false })
      .limit(1);
    const nextPosition = existing && existing.length ? existing[0].nomination_position + 1 : 1;
    const { error } = await supabase.from("teams").insert({
      draft_id: draftId,
      name: `Team ${teams.length + 1}`,
      nomination_position: nextPosition,
      budget_start: 100,
      points_remaining: 100,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else await onChanged();
  };

  const removeTeam = async (team: Team) => {
    if (!confirm(`Remove team "${team.name}"? Its pre-filled players will also be removed.`)) return;
    setErr(null);
    // players.team_id has no ON DELETE CASCADE, so this team's pre-fill
    // players (the only players it can hold, in setup) must be deleted
    // first or the team delete throws a raw FK violation.
    const { error: playersError } = await supabase.from("players").delete().eq("team_id", team.id);
    if (playersError) {
      setErr(playersError.message);
      return;
    }
    const { error } = await supabase.from("teams").delete().eq("id", team.id);
    if (error) setErr(error.message);
    else await onChanged();
  };

  const updateTeam = async (team: Team, patch: Partial<Team>) => {
    setErr(null);
    const { error } = await supabase.from("teams").update(patch).eq("id", team.id);
    if (error) setErr(error.message);
    else await onChanged();
  };

  const setBudget = async (team: Team, budget: number) => {
    await updateTeam(team, { budget_start: budget, points_remaining: budget });
  };

  const addPrefill = async (team: Team, role: LolRole, displayName: string) => {
    if (!displayName.trim() || busy) return; // guards double-submits (raw Postgres uniqueness errors otherwise)
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("players").insert({
      draft_id: draftId,
      display_name: displayName.trim(),
      role,
      team_id: team.id,
      price: 0,
      acquisition: "captain",
    });
    setBusy(false);
    if (error) setErr(error.message);
    else await onChanged();
  };

  const removePrefill = async (player: Player) => {
    setErr(null);
    const { error } = await supabase.from("players").delete().eq("id", player.id);
    if (error) setErr(error.message);
    else await onChanged();
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">Teams</h2>
        <button
          disabled={busy}
          onClick={addTeam}
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          Add team
        </button>
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="flex flex-col gap-4">
        {teams.map((team) => {
          const prefills = players.filter((p) => p.team_id === team.id);
          return (
            <div key={team.id} className="flex flex-col gap-3 rounded-lg border border-zinc-800 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={team.name}
                  onChange={(e) => updateTeam(team, { name: e.target.value })}
                  className="w-40 rounded border border-zinc-700 bg-black/30 px-2 py-1 text-sm text-zinc-100"
                />
                <label className="flex items-center gap-1 text-xs text-zinc-400">
                  Position
                  <input
                    type="number"
                    min={1}
                    value={team.nomination_position}
                    onChange={(e) =>
                      updateTeam(team, { nomination_position: Number(e.target.value) })
                    }
                    className="w-16 rounded border border-zinc-700 bg-black/30 px-2 py-1 text-sm text-zinc-100"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-zinc-400">
                  Budget
                  <input
                    type="number"
                    min={0}
                    value={team.budget_start}
                    onChange={(e) => setBudget(team, Number(e.target.value))}
                    className="w-20 rounded border border-zinc-700 bg-black/30 px-2 py-1 text-sm text-zinc-100"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-zinc-400">
                  Captain
                  <select
                    value={team.captain_profile_id ?? ""}
                    onChange={(e) =>
                      updateTeam(team, { captain_profile_id: e.target.value || null })
                    }
                    className="rounded border border-zinc-700 bg-black/30 px-2 py-1 text-sm text-zinc-100"
                  >
                    <option value="">— none —</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() => removeTeam(team)}
                  className="ml-auto rounded bg-red-800 px-2 py-1 text-xs font-semibold text-white"
                >
                  Remove team
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Pre-filled players ({prefills.length}/2)
                </h3>
                <ul className="flex flex-col gap-1">
                  {prefills.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-black/20 px-2 py-1 text-sm"
                    >
                      <span className="text-zinc-100">
                        {p.display_name} <span className="text-xs text-zinc-500">· {p.role}</span>
                      </span>
                      <button
                        onClick={() => removePrefill(p)}
                        className="shrink-0 rounded bg-red-800 px-2 py-0.5 text-xs font-semibold text-white"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                {prefills.length < 2 && (
                  <PrefillForm
                    usedRoles={prefills.map((p) => p.role)}
                    disabled={busy}
                    onAdd={(role, name) => addPrefill(team, role, name)}
                  />
                )}
              </div>
            </div>
          );
        })}
        {teams.length === 0 && <p className="text-sm opacity-60">No teams yet.</p>}
      </div>
    </section>
  );
}

function PrefillForm({
  usedRoles,
  disabled,
  onAdd,
}: {
  usedRoles: LolRole[];
  disabled: boolean;
  onAdd: (role: LolRole, name: string) => void;
}) {
  const available = ROLE_ORDER.filter((r) => !usedRoles.includes(r));
  const [role, setRole] = useState<LolRole>(available[0] ?? "top");
  const [name, setName] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onAdd(role, name);
        setName("");
      }}
      className="flex items-center gap-2"
    >
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as LolRole)}
        className="rounded border border-zinc-700 bg-black/30 px-2 py-1 text-sm text-zinc-100"
      >
        {available.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Player name"
        className="flex-1 rounded border border-zinc-700 bg-black/30 px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-600"
      />
      <button
        type="submit"
        disabled={!name.trim() || disabled}
        className="rounded bg-indigo-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-40"
      >
        Add
      </button>
    </form>
  );
}
