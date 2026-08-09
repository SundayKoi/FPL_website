"use client";
import { useState, type ReactNode } from "react";
import { useDraftState } from "@/hooks/useDraftState";
import { useCountdown } from "@/hooks/useCountdown";
import { maxBid } from "@/lib/draft/derive";
import CenterStage from "./CenterStage";
import TeamColumn from "./TeamColumn";
import PlayerPool from "./PlayerPool";
import BidFeed from "./BidFeed";
import FinalRosters from "./FinalRosters";
import DraftHeader from "./DraftHeader";
import BidControls from "./BidControls";
import NominationPicker from "./NominationPicker";
import AdminStrip from "./AdminStrip";
import Toast from "./Toast";

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
  const [toast, setToast] = useState<string | null>(null);

  if (!s.draft)
    return (
      <main className="flex min-h-screen items-center justify-center bg-navy bg-hash p-8">
        <div className="card-brand px-10 py-8 text-center">
          <p className="type-display text-xl text-white">Loading draft…</p>
        </div>
      </main>
    );

  const { draft, teams, players, lots, bids, openLot, myTeam } = s;
  const lotPlayer = openLot ? players.find((p) => p.id === openLot.player_id) ?? null : null;
  const leadingTeam = openLot ? teams.find((t) => t.id === openLot.leading_team_id) ?? null : null;
  const nominatorTeam = teams.find((t) => t.id === draft.current_nominator_team_id) ?? null;
  const isMyNomination =
    draft.status === "live" &&
    !!myTeam &&
    draft.current_nominator_team_id === myTeam.id &&
    !openLot;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 bg-hash px-4 py-6 text-white">
      <DraftHeader draft={draft} connected={s.connected} />

      {myTeam && (
        <div className="card-brand px-4 py-3 text-sm text-steel">
          You are <span className="type-display text-base not-italic text-white">Team {myTeam.name}</span> —{" "}
          <span className="font-display font-semibold not-italic text-gold">{myTeam.points_remaining} pts</span>,
          max bid{" "}
          <span className="font-display font-semibold not-italic text-gold">{maxBid(myTeam, players)}</span>
        </div>
      )}

      {draft.status === "setup" ? (
        <section className="card-brand flex flex-1 flex-col items-center justify-center gap-2 p-16 text-center">
          <p className="type-display text-2xl text-white">Draft hasn&apos;t started</p>
          <p className="text-sm text-steel">Check back once the admin goes live.</p>
        </section>
      ) : (
        <>
          {draft.status === "paused" && (
            <div className="rounded-lg border border-gold/50 bg-gold/10 px-4 py-2 text-center text-sm font-semibold text-gold">
              <span className="label-dash !text-gold">Paused by admin</span>
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
                {draft.status === "live" && myTeam && openLot && lotPlayer && (
                  <BidControls
                    team={myTeam}
                    lot={openLot}
                    lotPlayer={lotPlayer}
                    players={players}
                    onError={setToast}
                  />
                )}
                {myTeam && isMyNomination && (
                  <NominationPicker team={myTeam} draft={draft} players={players} onError={setToast} />
                )}
                {captainControls}
                {s.isAdmin && <AdminStrip draft={draft} openLot={openLot} onError={setToast} />}
                {adminControls}
              </div>

              <BidFeed bids={bids} teams={teams} players={players} lots={lots} />
            </div>
          )}

          <PlayerPool players={players} teams={teams} />
        </>
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </main>
  );
}
