"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { errCode, type Draft, type Lot, type Player, type Team } from "@/lib/draft/types";
import { friendly } from "./Toast";

export default function AdminAssignmentPanel({
  draft,
  teams,
  players,
  openLot,
  onError,
}: {
  draft: Draft;
  teams: Team[];
  players: Player[];
  openLot: Lot | null;
  onError: (message: string) => void;
}) {
  const supabase = createClient();
  const [playerId, setPlayerId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  const availablePlayers = players.filter((player) => player.team_id === null);
  const selectedPlayer = availablePlayers.find((player) => player.id === playerId) ?? null;
  const eligibleTeams = selectedPlayer
    ? teams.filter(
        (team) =>
          !players.some((player) => player.team_id === team.id && player.role === selectedPlayer.role)
      )
    : [];
  const selectedTeam = eligibleTeams.find((team) => team.id === teamId) ?? null;
  const numericPrice = Number(price);

  if ((draft.status !== "live" && draft.status !== "paused") || openLot) return null;

  const assignPlayer = async () => {
    if (
      busy ||
      !selectedPlayer ||
      !selectedTeam ||
      price.trim() === "" ||
      !Number.isInteger(numericPrice) ||
      numericPrice < 0
    ) {
      return;
    }

    if (
      !window.confirm(
        `Assign ${selectedPlayer.display_name} to ${selectedTeam.name} for ${numericPrice} points?`
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_assign_player", {
        p_draft_id: draft.id,
        p_player_id: selectedPlayer.id,
        p_team_id: selectedTeam.id,
        p_price: numericPrice,
      });
      if (error) {
        onError(friendly(errCode(error)));
        return;
      }
      setPlayerId("");
      setTeamId("");
      setPrice("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card-brand flex flex-col gap-3 p-3">
      <h3 className="label-dash">Direct assignment</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-steel">
          Player
          <select
            value={playerId}
            onChange={(event) => {
              setPlayerId(event.target.value);
              setTeamId("");
            }}
            className="rounded border border-line bg-navy px-2 py-1 text-white focus:border-coral focus:outline-none"
          >
            <option value="">Select a player</option>
            {availablePlayers.map((player) => (
              <option key={player.id} value={player.id}>
                {player.display_name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-steel">
          Team
          <select
            value={teamId}
            disabled={!selectedPlayer}
            onChange={(event) => setTeamId(event.target.value)}
            className="rounded border border-line bg-navy px-2 py-1 text-white focus:border-coral focus:outline-none disabled:opacity-40"
          >
            <option value="">Select a team</option>
            {eligibleTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-steel">
          Price
          <input
            type="number"
            min={0}
            step={1}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="w-24 rounded border border-line bg-navy px-2 py-1 text-white focus:border-coral focus:outline-none"
          />
        </label>

        <button
          type="button"
          disabled={busy}
          onClick={() => void assignPlayer()}
          className="rounded border border-coral px-3 py-1.5 text-sm font-semibold text-coral hover:bg-coral/10 disabled:opacity-40"
        >
          Assign player
        </button>
      </div>
    </section>
  );
}
