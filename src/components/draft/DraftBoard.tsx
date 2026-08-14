"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
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
  const { secondsLeft } = useCountdown(
    s.draft?.status === "live" ? (s.openLot?.closes_at ?? null) : null,
    s.offsetMs
  );
  const [toast, setToast] = useState<string | null>(null);
  const [collapseAllTeams, setCollapseAllTeams] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);

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
    <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-4 bg-hash px-4 py-6 text-white">
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
            <FinalRosters teams={teams} players={players} myTeamId={myTeam?.id ?? null} />
          ) : (
            <div
              className={`relative grid gap-4 lg:items-start ${
                chatCollapsed
                  ? "lg:grid-cols-[minmax(30rem,36rem)_minmax(0,1fr)]"
                  : "lg:grid-cols-[minmax(30rem,36rem)_minmax(0,1fr)_minmax(18rem,21rem)]"
              }`}
            >
              <aside
                aria-label="Draft teams"
                className="order-4 lg:col-start-1 lg:row-span-2 lg:row-start-1"
              >
                <section className="lg:sticky lg:top-20">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="label-dash">TEAMS</h2>
                    <button
                      type="button"
                      onClick={() => setCollapseAllTeams((current) => !current)}
                      className="rounded border border-line px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-steel hover:border-gold hover:text-gold"
                    >
                      {collapseAllTeams ? "Expand all" : "Collapse all"}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {teams.map((team) => (
                      <TeamColumn
                        key={`${team.id}-${collapseAllTeams}`}
                        team={team}
                        players={players}
                        isNominator={team.id === draft.current_nominator_team_id}
                        isMyTeam={myTeam?.id === team.id}
                        initialCollapsed={collapseAllTeams}
                      />
                    ))}
                  </div>
                </section>
              </aside>

              <div className="order-1 min-w-0 space-y-4 lg:col-start-2 lg:row-start-1">
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
                    openLot={openLot}
                    onError={setToast}
                  />
                )}
                {adminControls}

              </div>

              <aside
                aria-label="Draft chat rail"
                className={`order-2 min-w-0 self-start ${
                  chatCollapsed
                    ? "lg:hidden"
                    : "lg:sticky lg:top-16 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:h-[calc(100dvh-4rem)] lg:overflow-hidden"
                }`}
              >
                <DraftChat
                  draftId={draftId}
                  profileId={s.profileId}
                  isAdmin={s.isAdmin}
                  className="h-full"
                  chatCollapsed={chatCollapsed}
                  onToggle={() => setChatCollapsed((current) => !current)}
                />
              </aside>

              {chatCollapsed && (
                <button
                  type="button"
                  onClick={() => setChatCollapsed(false)}
                  className="hidden rounded border border-gold px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gold hover:bg-gold/10 lg:absolute lg:right-0 lg:top-0 lg:block"
                >
                  Open chat
                </button>
              )}

              <div className="order-3 min-w-0 lg:col-start-2 lg:row-start-2">
                <PlayerPool players={players} teams={teams} compact showFilters={false} />
              </div>
            </div>
          )}
        </>
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </main>
  );
}
