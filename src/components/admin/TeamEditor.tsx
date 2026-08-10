"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ROLE_ORDER, type LolRole, type Player, type Profile, type Team } from "@/lib/draft/types";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

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
    const name = `Team ${teams.length + 1}`;
    const { error } = await supabase.from("teams").insert({
      draft_id: draftId,
      name,
      abbreviation: initials(name),
      nomination_position: nextPosition,
      budget_start: 100,
      points_remaining: 100,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else await onChanged();
  };

  const removeTeam = async (team: Team) => {
    if (
      !confirm(
        `Remove team "${team.name}"? New prefills will be removed and existing players returned to the pool.`
      )
    ) return;
    setErr(null);
    const { error } = await supabase.rpc("admin_remove_setup_team", {
      p_draft_id: draftId,
      p_team_id: team.id,
    });
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
    setErr(null);
    const { error } = await supabase.rpc("admin_set_setup_team_budget", {
      p_draft_id: draftId,
      p_team_id: team.id,
      p_budget: budget,
    });
    if (error) setErr(error.message);
    else await onChanged();
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

  const addExistingPrefill = async (
    team: Team,
    playerId: string,
    price: number
  ): Promise<boolean> => {
    if (!playerId || !Number.isInteger(price) || price < 0 || busy) return false;
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.rpc("admin_assign_setup_player", {
        p_draft_id: draftId,
        p_player_id: playerId,
        p_team_id: team.id,
        p_price: price,
      });
      if (error) {
        setErr(error.message);
        return false;
      }
      await onChanged();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const removePrefill = async (player: Player) => {
    setErr(null);
    const { error } = await supabase.rpc("admin_remove_setup_player", {
      p_draft_id: draftId,
      p_player_id: player.id,
    });
    if (error) setErr(error.message);
    else await onChanged();
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="label-dash">Teams</h2>
        <button
          disabled={busy}
          onClick={addTeam}
          className="rounded bg-gold px-3 py-1.5 text-xs font-display font-bold not-italic text-navy hover:brightness-110 disabled:opacity-40"
        >
          Add team
        </button>
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="flex flex-col gap-4">
        {teams.map((team) => {
          const prefills = players.filter((p) => p.team_id === team.id);
          const availablePoolPlayers = players.filter(
            (p) =>
              p.draft_id === draftId &&
              p.team_id === null &&
              !prefills.some((prefill) => prefill.role === p.role)
          );
          return (
            <div key={team.id} className="card-brand flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={team.name}
                  onChange={(e) => updateTeam(team, { name: e.target.value })}
                  className="w-40 rounded border border-line bg-navy px-2 py-1 text-sm text-white placeholder:text-steel/60 focus:border-gold focus:outline-none"
                />
                <label className="flex items-center gap-1 text-xs text-steel">
                  Position
                  <input
                    type="number"
                    min={1}
                    value={team.nomination_position}
                    onChange={(e) =>
                      updateTeam(team, { nomination_position: Number(e.target.value) })
                    }
                    className="w-16 rounded border border-line bg-navy px-2 py-1 text-sm text-white placeholder:text-steel/60 focus:border-gold focus:outline-none"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-steel">
                  Budget
                  <input
                    type="number"
                    min={0}
                    value={team.budget_start}
                    onChange={(e) => setBudget(team, Number(e.target.value))}
                    className="w-20 rounded border border-line bg-navy px-2 py-1 text-sm text-white placeholder:text-steel/60 focus:border-gold focus:outline-none"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-steel">
                  Captain
                  <select
                    value={team.captain_profile_id ?? ""}
                    onChange={(e) =>
                      updateTeam(team, { captain_profile_id: e.target.value || null })
                    }
                    className="rounded border border-line bg-navy px-2 py-1 text-sm text-white focus:border-gold focus:outline-none"
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
                  className="ml-auto rounded border border-red-500/60 px-2 py-1 text-xs font-semibold text-red-400"
                >
                  Remove team
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="label-dash">
                  Pre-filled players ({prefills.length}/2)
                </h3>
                <ul className="flex flex-col gap-1">
                  {prefills.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded border border-line bg-navy/40 px-2 py-1 text-sm"
                    >
                      <span className="text-white">
                        {p.display_name} <span className="text-xs text-steel">· {p.role}</span>
                      </span>
                      <button
                        onClick={() => removePrefill(p)}
                        className="shrink-0 rounded border border-red-500/60 px-2 py-0.5 text-xs font-semibold text-red-400"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                {prefills.length < 2 && (
                  <>
                    <PrefillForm
                      usedRoles={prefills.map((p) => p.role)}
                      disabled={busy}
                      onAdd={(role, name) => addPrefill(team, role, name)}
                    />
                    <ExistingPrefillForm
                      players={availablePoolPlayers}
                      disabled={busy}
                      onAdd={(playerId, price) => addExistingPrefill(team, playerId, price)}
                    />
                  </>
                )}
              </div>
            </div>
          );
        })}
        {teams.length === 0 && <p className="text-sm text-steel">No teams yet.</p>}
      </div>
    </section>
  );
}

function ExistingPrefillForm({
  players,
  disabled,
  onAdd,
}: {
  players: Player[];
  disabled: boolean;
  onAdd: (playerId: string, price: number) => Promise<boolean>;
}) {
  const [playerId, setPlayerId] = useState("");
  const [price, setPrice] = useState("");
  const validPrice = /^\d+$/.test(price);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!playerId || !validPrice) return;
        if (await onAdd(playerId, Number(price))) {
          setPlayerId("");
          setPrice("");
        }
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <label className="flex items-center gap-1 text-xs text-steel">
        Existing player
        <select
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          disabled={disabled || players.length === 0}
          className="rounded border border-line bg-navy px-2 py-1 text-sm text-white focus:border-gold focus:outline-none disabled:opacity-40"
        >
          <option value="">— select player —</option>
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {player.display_name} · {player.role}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1 text-xs text-steel">
        Point value
        <input
          type="number"
          min={0}
          step={1}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          disabled={disabled || players.length === 0}
          className="w-20 rounded border border-line bg-navy px-2 py-1 text-sm text-white placeholder:text-steel/60 focus:border-gold focus:outline-none disabled:opacity-40"
        />
      </label>
      <button
        type="submit"
        disabled={disabled || players.length === 0 || !playerId || !validPrice}
        className="rounded bg-gold px-2 py-1 text-xs font-display font-bold not-italic text-navy hover:brightness-110 disabled:opacity-40"
      >
        Add existing player
      </button>
    </form>
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
        className="rounded border border-line bg-navy px-2 py-1 text-sm text-white focus:border-gold focus:outline-none"
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
        className="flex-1 rounded border border-line bg-navy px-2 py-1 text-sm text-white placeholder:text-steel/60 focus:border-gold focus:outline-none"
      />
      <button
        type="submit"
        disabled={!name.trim() || disabled}
        className="rounded bg-gold px-2 py-1 text-xs font-display font-bold not-italic text-navy hover:brightness-110 disabled:opacity-40"
      >
        Add
      </button>
    </form>
  );
}
