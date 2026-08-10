"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ROLE_ORDER,
  type Player,
  type RosterSlotView,
  type RosterTeamView,
  type Team,
} from "@/lib/draft/types";
import TeamRosterCard from "./TeamRosterCard";

const accentClasses = [
  "bg-cyan-950",
  "bg-red-950",
  "bg-violet-950",
  "bg-emerald-950",
  "bg-amber-950",
  "bg-sky-950",
] as const;

export function toRosterTeams(teams: Team[], players: Player[]): RosterTeamView[] {
  return teams.map((team, teamIndex) => {
    const roster = players.filter((player) => player.team_id === team.id);
    const captain = roster.find((player) => player.acquisition === "captain");

    return {
      id: team.id,
      name: team.name,
      captainName: captain?.display_name ?? "Unassigned",
      monogram: team.name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 3)
        .toUpperCase(),
      accentClass: accentClasses[teamIndex % accentClasses.length],
      pointsRemaining: team.points_remaining,
      players: ROLE_ORDER.map((role) => {
        const player = roster.find((candidate) => candidate.role === role);
        return player
          ? {
              id: player.id,
              role: player.role,
              displayName: player.display_name,
              price: player.price ?? 0,
              acquisition: player.acquisition,
            }
          : {
              id: `empty-${team.id}-${role}`,
              role,
              displayName: "Open slot",
              price: 0,
              acquisition: null,
              isEmpty: true,
            };
      }),
    };
  });
}

function errorMessage(error: unknown) {
  const raw =
    typeof error === "string"
      ? error
      : (error as { message?: string } | null)?.message ?? "The roster swap failed.";
  const code = /^([A-Z_]+):/.exec(raw)?.[1];
  const messages: Record<string, string> = {
    CAPTAIN_LOCKED: "Captains cannot be traded.",
    ROLE_MISMATCH: "Players must be in the same position to swap.",
    SAME_TEAM: "Choose a player from another team.",
    DRAFT_MISMATCH: "Players must belong to the same draft.",
    PLAYER_UNASSIGNED: "Both players must already be rostered.",
  };
  return (code && messages[code]) || raw.replace(/^[A-Z_]+:\s*/, "");
}

export default function AdminRosterEditor({
  draftId,
  teams,
  players,
}: {
  draftId: string;
  teams: Team[];
  players: Player[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const teamViews = useMemo(() => toRosterTeams(teams, players), [teams, players]);
  const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);
  const [keyboardPlayerId, setKeyboardPlayerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const keyboardPlayer = players.find((player) => player.id === keyboardPlayerId) ?? null;
  const swapTargets = keyboardPlayer
    ? players.filter(
        (player) =>
          player.id !== keyboardPlayer.id &&
          player.team_id !== null &&
          player.team_id !== keyboardPlayer.team_id &&
          player.role === keyboardPlayer.role &&
          player.acquisition !== "captain",
      )
    : [];

  const requestSwap = async (source: Player, target: Player) => {
    if (busy) return;
    if (source.acquisition === "captain" || target.acquisition === "captain") {
      setStatus("Captains cannot be traded.");
      return;
    }
    if (source.team_id === null || target.team_id === null) {
      setStatus("Both players must already be rostered.");
      return;
    }
    if (source.team_id === target.team_id) {
      setStatus("Choose a player from another team.");
      return;
    }
    if (source.role !== target.role) {
      setStatus("Players must be in the same position to swap.");
      return;
    }

    setBusy(true);
    setStatus(null);
    const { error } = await supabase.rpc("swap_roster_players", {
      p_left_player_id: source.id,
      p_right_player_id: target.id,
    });
    setBusy(false);
    setDraggedPlayerId(null);
    setKeyboardPlayerId(null);
    if (error) {
      setStatus(errorMessage(error));
      return;
    }
    setStatus(`${source.display_name} swapped with ${target.display_name}.`);
    router.refresh();
  };

  const handleDrop = (target: RosterSlotView) => {
    const source = players.find((player) => player.id === draggedPlayerId);
    const targetPlayer = players.find((player) => player.id === target.id);
    setDraggedPlayerId(null);
    if (!source || !targetPlayer) {
      setStatus("Choose two rostered players to swap.");
      return;
    }
    void requestSwap(source, targetPlayer);
  };

  return (
    <>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {teamViews.map((team) => (
          <TeamRosterCard
            key={team.id}
            team={team}
            editable
            onDragStart={(player) => {
              setDraggedPlayerId(player.id);
              setStatus(null);
            }}
            onDragEnd={() => setDraggedPlayerId(null)}
            onDrop={handleDrop}
            onKeyboardSwap={(player) => {
              setKeyboardPlayerId(player.id);
              setStatus(null);
            }}
          />
        ))}
      </div>

      <div role="status" aria-live="polite" className="mt-5 min-h-5 text-sm text-steel">
        {busy ? "Saving roster swap…" : status}
      </div>

      {keyboardPlayer ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="swap-dialog-heading"
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/80 p-4 backdrop-blur-sm"
        >
          <div className="card-brand w-full max-w-md p-6">
            <h2 id="swap-dialog-heading" className="font-display text-2xl text-white">
              Swap {keyboardPlayer.display_name}
            </h2>
            <p className="mt-2 text-sm text-steel">
              Choose another team&apos;s {keyboardPlayer.role} player.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {swapTargets.length ? (
                swapTargets.map((target) => {
                  const targetTeam = teams.find((team) => team.id === target.team_id);
                  return (
                    <button
                      key={target.id}
                      type="button"
                      disabled={busy}
                      onClick={() => void requestSwap(keyboardPlayer, target)}
                      className="flex items-center justify-between rounded border border-line bg-navy px-3 py-2 text-left text-sm text-white hover:border-gold disabled:opacity-50"
                    >
                      <span>{target.display_name}</span>
                      <span className="text-xs uppercase tracking-[0.12em] text-steel">
                        {targetTeam?.name ?? "Other team"}
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="text-sm text-steel">No same-position players are available.</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setKeyboardPlayerId(null)}
              className="mt-5 rounded border border-steel px-3 py-2 text-sm font-semibold text-white hover:border-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
