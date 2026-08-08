"use client";
import type { ReactNode } from "react";
import { useDraftState } from "@/hooks/useDraftState";
import { useCountdown } from "@/hooks/useCountdown";
import CenterStage from "./CenterStage";
import TeamColumn from "./TeamColumn";
import PlayerPool from "./PlayerPool";
import BidFeed from "./BidFeed";
import FinalRosters from "./FinalRosters";
import DraftHeader from "./DraftHeader";

export default function DraftBoard({
  draftId,
  captainControls = null,
  adminControls = null,
}: {
  draftId: string;
  captainControls?: ReactNode;
  adminControls?: ReactNode;
}) {
  const s = useDraftState(draftId);
  const { secondsLeft } = useCountdown(
    s.draft?.status === "live" ? (s.openLot?.closes_at ?? null) : null,
    s.offsetMs
  );

  if (!s.draft) return <main className="p-8 text-zinc-400">Loading draft…</main>;

  const { draft, teams, players, lots, bids, openLot, myTeam } = s;
  const lotPlayer = openLot ? players.find((p) => p.id === openLot.player_id) ?? null : null;
  const leadingTeam = openLot ? teams.find((t) => t.id === openLot.leading_team_id) ?? null : null;
  const nominatorTeam = teams.find((t) => t.id === draft.current_nominator_team_id) ?? null;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 text-zinc-100">
      <DraftHeader draft={draft} connected={s.connected} />

      {draft.status === "setup" ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-16 text-center">
          <p className="text-lg text-zinc-300">Draft hasn&apos;t started</p>
          <p className="text-sm text-zinc-500">Check back once the admin goes live.</p>
        </section>
      ) : (
        <>
          {draft.status === "paused" && (
            <div className="rounded-lg bg-amber-600 px-4 py-2 text-center text-sm font-semibold text-black">
              Paused by admin
            </div>
          )}

          {draft.status === "complete" ? (
            <FinalRosters teams={teams} players={players} myTeamId={myTeam?.id ?? null} />
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.4fr_1fr]">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {teams.map((team) => (
                  <TeamColumn
                    key={team.id}
                    team={team}
                    players={players}
                    isNominator={team.id === draft.current_nominator_team_id}
                    isMyTeam={myTeam?.id === team.id}
                  />
                ))}
              </div>

              <div className="flex flex-col gap-3">
                <CenterStage
                  lot={openLot}
                  player={lotPlayer}
                  leadingTeam={leadingTeam}
                  secondsLeft={secondsLeft}
                  paused={draft.status === "paused"}
                  nominatorTeam={nominatorTeam}
                />
                {captainControls}
                {adminControls}
              </div>

              <BidFeed bids={bids} teams={teams} players={players} lots={lots} />
            </div>
          )}

          <PlayerPool players={players} teams={teams} />
        </>
      )}
    </main>
  );
}
