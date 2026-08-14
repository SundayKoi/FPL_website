"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useDraftState } from "@/hooks/useDraftState";
import { useCountdown } from "@/hooks/useCountdown";
import { useNemesisPicks } from "@/hooks/useNemesisPicks";
import { maxBid } from "@/lib/draft/derive";
import CenterStage from "./CenterStage";
import TeamColumn from "./TeamColumn";
import PlayerPool from "./PlayerPool";
import BidFeed from "./BidFeed";
import FinalRosters from "./FinalRosters";
import NemesisBoard from "./NemesisBoard";
import DraftHeader from "./DraftHeader";
import BidControls from "./BidControls";
import NominationPicker from "./NominationPicker";
import AdminStrip from "./AdminStrip";
import DraftChat from "./DraftChat";
import NominationAlert from "./NominationAlert";
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
  const { picks: nemesisPicks } = useNemesisPicks(draftId);
  const { secondsLeft } = useCountdown(
    s.draft?.status === "live" ? (s.openLot?.closes_at ?? null) : null,
    s.offsetMs
  );
  const [toast, setToast] = useState<string | null>(null);

  if (!s.draft)
    return (
      <main className="flex min-h-screen items-center justify-center bg-navy bg-hash p-8">
        <div className="card-brand px-10 py-8 text-center">
          {s.loaded ? (
            <>
              <p className="type-display text-xl text-white">Draft not found</p>
              <p className="mt-2 text-sm text-steel">
                This draft may have been deleted or the link is out of date.
              </p>
              <Link href="/" className="btn-pill mt-4 inline-block text-sm">
                Back to drafts
              </Link>
            </>
          ) : (
            <p className="type-display text-xl text-white">Loading draft…</p>
          )}
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

      <NominationAlert
        isMyNomination={isMyNomination}
        round={draft.current_round}
        minimumBid={draft.round_minimums[Math.min(draft.current_round, draft.round_minimums.length) - 1]}
      />

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
            <div className="flex flex-col gap-4">
              <NemesisBoard
                draftId={draftId}
                teams={teams}
                picks={nemesisPicks}
                myTeamId={myTeam?.id ?? null}
                isAdmin={s.isAdmin}
                onError={setToast}
              />
              <FinalRosters teams={teams} players={players} myTeamId={myTeam?.id ?? null} />
            </div>
          ) : (
            <div className="flex gap-4">
              {myTeam && (
                <aside className="hidden w-64 shrink-0 lg:block">
                  <div className="sticky top-20">
                    <TeamColumn
                      team={myTeam}
                      players={players}
                      isNominator={draft.current_nominator_team_id === myTeam.id}
                      isMyTeam
                    />
                  </div>
                </aside>
              )}

              <div className="min-w-0 flex-1 space-y-4">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr]">
                  <CenterStage
                    lot={openLot}
                    player={lotPlayer}
                    leadingTeam={leadingTeam}
                    secondsLeft={secondsLeft}
                    paused={draft.status === "paused"}
                    nominatorTeam={nominatorTeam}
                  />
                  <BidFeed bids={bids} teams={teams} players={players} lots={lots} />
                </div>

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
                {s.isAdmin && (
                  <AdminStrip
                    draft={draft}
                    teams={teams}
                    players={players}
                    lots={lots}
                    openLot={openLot}
                    onError={setToast}
                  />
                )}
                {adminControls}

                <DraftChat draftId={draftId} profileId={s.profileId} isAdmin={s.isAdmin} />

                <PlayerPool players={players} teams={teams} />

                <section>
                  <h2 className="label-dash mb-2">TEAMS</h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                </section>
              </div>
            </div>
          )}
        </>
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </main>
  );
}
