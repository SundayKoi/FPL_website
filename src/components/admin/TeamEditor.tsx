"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Acquisition, Player, Profile, Team } from "@/lib/draft/types";
import { currentPlayerPointValue } from "@/lib/players/pointValues";

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

  const addExistingPrefill = async (
    team: Team,
    playerId: string,
    acquisition: Acquisition,
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
        p_acquisition: acquisition,
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
          const setupAcquisitions: Acquisition[] = ["captain", "free_agency"];
          const availableAcquisitions = setupAcquisitions.filter(
            (acquisition) => !prefills.some((player) => player.acquisition === acquisition),
          );
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
                <ExistingPrefillForm
                  players={availablePoolPlayers}
                  acquisitions={availableAcquisitions}
                  disabled={busy || prefills.length >= 2}
                  onAdd={(playerId, acquisition, price) =>
                    addExistingPrefill(team, playerId, acquisition, price)
                  }
                />
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
  acquisitions,
  disabled,
  onAdd,
}: {
  players: Player[];
  acquisitions: Acquisition[];
  disabled: boolean;
  onAdd: (playerId: string, acquisition: Acquisition, price: number) => Promise<boolean>;
}) {
  const [playerId, setPlayerId] = useState("");
  const [acquisition, setAcquisition] = useState<Acquisition | "">(acquisitions[0] ?? "");
  const [price, setPrice] = useState("");
  const validPrice = /^\d+$/.test(price);
  const formDisabled = disabled || players.length === 0 || acquisitions.length === 0;
  const selectedAcquisition =
    acquisition && acquisitions.includes(acquisition) ? acquisition : acquisitions[0] ?? "";

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!playerId || !selectedAcquisition || !validPrice) return;
        if (await onAdd(playerId, selectedAcquisition, Number(price))) {
          setPlayerId("");
          setAcquisition(acquisitions[0] ?? "");
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
          disabled={formDisabled}
          className="rounded border border-line bg-navy px-2 py-1 text-sm text-white focus:border-gold focus:outline-none disabled:opacity-40"
        >
          <option value="">— select player —</option>
          {players.map((player) => {
            const pointValue = currentPlayerPointValue(player.display_name);
            return (
              <option key={player.id} value={player.id}>
                {player.display_name} · {player.role}
                {pointValue !== null ? ` · ${pointValue} pts` : ""}
              </option>
            );
          })}
        </select>
      </label>
      <label className="flex items-center gap-1 text-xs text-steel">
        Acquisition
        <select
          value={selectedAcquisition}
          onChange={(e) => setAcquisition(e.target.value as Acquisition)}
          disabled={formDisabled}
          className="rounded border border-line bg-navy px-2 py-1 text-sm text-white focus:border-gold focus:outline-none disabled:opacity-40"
        >
          {acquisitions.map((option) => (
            <option key={option} value={option}>
              {option === "captain" ? "Captain" : "Free Agency"}
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
          disabled={formDisabled}
          className="w-20 rounded border border-line bg-navy px-2 py-1 text-sm text-white placeholder:text-steel/60 focus:border-gold focus:outline-none disabled:opacity-40"
        />
      </label>
      <button
        type="submit"
        disabled={formDisabled || !playerId || !selectedAcquisition || !validPrice}
        className="rounded bg-gold px-2 py-1 text-xs font-display font-bold not-italic text-navy hover:brightness-110 disabled:opacity-40"
      >
        Add existing player
      </button>
    </form>
  );
}
