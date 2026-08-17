"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { errMessage, type Acquisition, type Player, type Profile, type Team } from "@/lib/draft/types";
import { applyOrder, moveItem } from "@/lib/draft/reorder";

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
  // Nomination order shown while a reorder is saving, so the list does not snap
  // back to the old order for the round trip.
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Drop the local order the moment the server's own order lands (adjusting
  // state during render rather than in an effect — see src/hooks/useCountdown).
  const serverOrder = teams.map((t) => t.id).join(",");
  const [seenOrder, setSeenOrder] = useState(serverOrder);
  if (seenOrder !== serverOrder) {
    setSeenOrder(serverOrder);
    setPendingOrder(null);
  }
  const ordered = applyOrder(teams, pendingOrder);

  const reorder = async (from: number, to: number) => {
    if (busy || from === to) return;
    const next = moveItem(ordered, from, to);
    if (next === ordered) return;
    const ids = next.map((t) => t.id);
    setBusy(true);
    setErr(null);
    setPendingOrder(ids);
    const { error } = await supabase.rpc("admin_reorder_setup_teams", {
      p_draft_id: draftId,
      p_team_ids: ids,
    });
    setBusy(false);
    if (error) {
      setPendingOrder(null);
      setErr(errMessage(error).replace(/^[A-Z_]+:\s*/, ""));
      return;
    }
    await onChanged();
  };

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
        <div>
          <h2 className="label-dash">Teams</h2>
          <p className="mt-1 text-xs text-steel">
            Drag a team by its handle to set the round-one nomination order.
          </p>
        </div>
        <button
          disabled={busy}
          onClick={addTeam}
          className="rounded bg-coral px-3 py-1.5 text-xs font-display font-bold not-italic text-navy hover:brightness-110 disabled:opacity-40"
        >
          Add team
        </button>
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="flex flex-col gap-4">
        {ordered.map((team, index) => {
          const prefills = players.filter((p) => p.team_id === team.id);
          const committedSpend = prefills.reduce((sum, player) => sum + (player.price ?? 0), 0);
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
          const captainOptions = profiles.filter(
            (profile) => profile.id !== team.captain_profile_id_2
          );
          const secondCaptainOptions = profiles.filter(
            (profile) => profile.id !== team.captain_profile_id
          );
          return (
            <div
              key={team.id}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault(); // required, or the browser refuses the drop
                setOverIndex(index);
              }}
              onDragLeave={() => setOverIndex((i) => (i === index ? null : i))}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragIndex;
                setDragIndex(null);
                setOverIndex(null);
                if (from !== null) void reorder(from, index);
              }}
              className={`card-brand flex flex-col gap-3 p-4 ${
                dragIndex === index ? "opacity-50" : ""
              } ${overIndex === index && dragIndex !== index ? "ring-2 ring-coral" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    // Firefox starts no drag at all without payload data.
                    e.dataTransfer.setData("text/plain", team.id);
                    setDragIndex(index);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  aria-label={`Drag ${team.name}`}
                  title="Drag to reorder"
                  className="cursor-grab select-none rounded border border-line px-2 py-1 text-sm leading-none text-steel active:cursor-grabbing"
                >
                  ⠿
                </span>
                <span
                  aria-label={`Nomination position for ${team.name}`}
                  className="w-6 text-center font-display text-sm not-italic text-gold"
                >
                  {index + 1}
                </span>
                <div className="flex flex-col">
                  <button
                    type="button"
                    disabled={busy || index === 0}
                    onClick={() => reorder(index, index - 1)}
                    aria-label={`Move ${team.name} up`}
                    className="px-1 text-[10px] leading-tight text-steel hover:text-coral disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={busy || index === ordered.length - 1}
                    onClick={() => reorder(index, index + 1)}
                    aria-label={`Move ${team.name} down`}
                    className="px-1 text-[10px] leading-tight text-steel hover:text-coral disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
                <input
                  value={team.name}
                  onChange={(e) => updateTeam(team, { name: e.target.value })}
                  className="w-40 rounded border border-line bg-navy px-2 py-1 text-sm text-white placeholder:text-steel/60 focus:border-coral focus:outline-none"
                />
                <label className="flex items-center gap-1 text-xs text-steel">
                  Budget
                  <input
                    type="number"
                    min={0}
                    value={team.points_remaining}
                    onChange={(e) => setBudget(team, Number(e.target.value) + committedSpend)}
                    className="w-20 rounded border border-line bg-navy px-2 py-1 text-sm text-white placeholder:text-steel/60 focus:border-coral focus:outline-none"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-steel">
                  Captain
                  <select
                    value={team.captain_profile_id ?? ""}
                    onChange={(e) =>
                      updateTeam(team, { captain_profile_id: e.target.value || null })
                    }
                    className="rounded border border-line bg-navy px-2 py-1 text-sm text-white focus:border-coral focus:outline-none"
                  >
                    <option value="">— none —</option>
                    {captainOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1 text-xs text-steel">
                  <span>Second captain (optional)</span>
                  <select
                    aria-label="Second captain"
                    value={team.captain_profile_id_2 ?? ""}
                    onChange={(e) =>
                      updateTeam(team, { captain_profile_id_2: e.target.value || null })
                    }
                    className="rounded border border-line bg-navy px-2 py-1 text-sm text-white focus:border-coral focus:outline-none"
                  >
                    <option value="">— none —</option>
                    {secondCaptainOptions.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.display_name}
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
                        {p.display_name}{" "}
                        <span className="text-xs text-steel">
                          · {p.role}
                          {p.price !== null ? ` · ${p.price} pts` : ""}
                        </span>
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
          className="rounded border border-line bg-navy px-2 py-1 text-sm text-white focus:border-coral focus:outline-none disabled:opacity-40"
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
        Acquisition
        <select
          value={selectedAcquisition}
          onChange={(e) => setAcquisition(e.target.value as Acquisition)}
          disabled={formDisabled}
          className="rounded border border-line bg-navy px-2 py-1 text-sm text-white focus:border-coral focus:outline-none disabled:opacity-40"
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
          className="w-20 rounded border border-line bg-navy px-2 py-1 text-sm text-white placeholder:text-steel/60 focus:border-coral focus:outline-none disabled:opacity-40"
        />
      </label>
      <button
        type="submit"
        disabled={formDisabled || !playerId || !selectedAcquisition || !validPrice}
        className="rounded bg-coral px-2 py-1 text-xs font-display font-bold not-italic text-navy hover:brightness-110 disabled:opacity-40"
      >
        Add existing player
      </button>
    </form>
  );
}
