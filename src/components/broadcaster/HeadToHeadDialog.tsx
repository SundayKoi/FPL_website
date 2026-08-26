"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import ChampionDatum from "@/components/captain/scouting/ChampionDatum";
import { ROLE_LABELS, ROLE_ORDER, type LolRole } from "@/lib/draft/types";
import type { BroadcasterMatchupPlayer, BroadcasterRoleMatchup } from "@/lib/broadcaster/matchups";
import type { ScoutSource } from "@/lib/scouting/types";
import BroadcasterPlayerStats from "./BroadcasterPlayerStats";

interface HeadToHeadDialogProps {
  open: boolean;
  onClose: () => void;
  teamA: ScoutSource;
  teamB: ScoutSource;
  matchups: BroadcasterRoleMatchup[];
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}

const OVERVIEW_ID = "head-to-head-overview";

function teamName(source: ScoutSource): string {
  return source.teamName ?? source.opponentName;
}

function rosterForRole(source: ScoutSource, role: LolRole): string[] {
  return source.roster.filter((player) => player.role === role).map((player) => player.displayName);
}

function cardsForTeam(matchups: BroadcasterRoleMatchup[], side: "teamAPlayers" | "teamBPlayers"): number {
  return matchups.reduce((count, matchup) => count + matchup[side].filter((player) => player.card).length, 0);
}

function TeamOverview({
  source,
  matchups,
  side,
}: {
  source: ScoutSource;
  matchups: BroadcasterRoleMatchup[];
  side: "teamAPlayers" | "teamBPlayers";
}) {
  const name = teamName(source);
  const cards = cardsForTeam(matchups, side);
  const coveredRoles = ROLE_ORDER.filter((role) => rosterForRole(source, role).length).length;

  return (
    <article className="relative overflow-hidden rounded-2xl border border-white/10 bg-navy/75 p-4 shadow-[0_0_28px_rgb(0_0_0_/_0.28)] sm:p-5">
      <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-coral via-pink to-purple" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mono-label text-coral">{side === "teamAPlayers" ? "Blue corner" : "Red corner"}</p>
          <h4 className="type-display mt-1 text-3xl text-white">{name}</h4>
        </div>
        <span className="rounded-full border border-gold/50 bg-gold/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-gold">
          {coveredRoles}/5 roles
        </span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2">
          <span className="block text-[10px] uppercase tracking-wider text-steel">Roster</span>
          <span className="mt-1 block text-lg font-black text-white">{source.roster.length}</span>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2">
          <span className="block text-[10px] uppercase tracking-wider text-steel">Cards ready</span>
          <span className="mt-1 block text-lg font-black text-cyan">{cards}</span>
        </div>
        <div className="col-span-2 rounded-lg border border-white/10 bg-white/[0.04] p-2 sm:col-span-1">
          <span className="block text-[10px] uppercase tracking-wider text-steel">Battle plan</span>
          <span className="mt-1 block text-sm font-bold text-white">Pressure every lane</span>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {ROLE_ORDER.map((role) => {
          const players = rosterForRole(source, role);
          return (
            <div key={role} className="flex items-center gap-3 border-t border-white/10 pt-2">
              <span className="w-16 text-[10px] font-black uppercase tracking-[0.16em] text-gold">{ROLE_LABELS[role]}</span>
              <span className="min-w-0 truncate text-sm font-semibold text-white">{players.length ? players.join(" · ") : "Open slot"}</span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function OverviewPanel({
  teamA,
  teamB,
  matchups,
  onSelect,
}: {
  teamA: ScoutSource;
  teamB: ScoutSource;
  matchups: BroadcasterRoleMatchup[];
  onSelect: (index: number) => void;
}) {
  return (
    <section aria-labelledby={`${OVERVIEW_ID}-title`} className="space-y-5">
      <div>
        <p className="mono-label text-cyan">01 / 06 · Rivalry briefing</p>
        <h3 id={`${OVERVIEW_ID}-title`} className="type-display mt-1 text-4xl text-white sm:text-5xl">Matchup overview</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-steel">
          Two rosters. Five pressure points. Set your call before first blood and keep every player card ready for the spotlight.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TeamOverview source={teamA} matchups={matchups} side="teamAPlayers" />
        <TeamOverview source={teamB} matchups={matchups} side="teamBPlayers" />
      </div>
      <div className="rounded-2xl border border-pink/30 bg-gradient-to-r from-coral/10 via-pink/10 to-purple/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mono-label text-pink">Caster cue</p>
            <p className="mt-1 text-sm font-semibold text-white">Pick lane. Build heat. Move when matchup shifts.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {matchups.map((matchup, index) => (
              <button
                key={matchup.role}
                type="button"
                onClick={() => onSelect(index + 1)}
                className="rounded-full border border-pink/40 bg-navy/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-pink transition hover:border-cyan hover:text-cyan"
              >
                {matchup.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SpotlightPlayer({
  player,
  team,
  tone,
}: {
  player: BroadcasterMatchupPlayer;
  team: string;
  tone: "coral" | "cyan";
}) {
  return (
    <article className="space-y-3 rounded-2xl border border-white/10 bg-navy/65 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`mono-label ${tone === "coral" ? "text-coral" : "text-cyan"}`}>{team}</p>
          <h4 className="mt-1 text-xl font-black text-white">{player.name}</h4>
          <p className="mt-0.5 text-xs uppercase tracking-[0.16em] text-steel">{ROLE_LABELS[player.role]} · player card</p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wider ${tone === "coral" ? "border-coral/50 text-coral" : "border-cyan/50 text-cyan"}`}>
          {player.gamesSampled} games
        </span>
      </div>
      {player.card ? (
        <div className="mx-auto w-full max-w-[20rem]">
          <PlayerCard3D card={player.card} interactive={false} className="!w-full" />
        </div>
      ) : (
        <div className="mx-auto flex aspect-[5/7] w-full max-w-[20rem] items-center justify-center rounded-2xl border border-dashed border-line bg-panel/70 p-6 text-center text-xs uppercase tracking-[0.18em] text-steel">
          Player card unavailable
        </div>
      )}
      <BroadcasterPlayerStats player={player} spotlight />
      <div className="border-t border-white/10 pt-3">
        <p className="mono-label text-gold">Champion pool</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {player.champions.length ? player.champions.slice(0, 4).map((champion) => (
            <span key={champion.champion} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel/80 px-2 py-1">
              <ChampionDatum champion={champion.champion} />
              <span className="text-[10px] text-steel">×{champion.count}</span>
            </span>
          )) : <span className="text-xs text-steel">No draft picks on record</span>}
        </div>
      </div>
    </article>
  );
}

function SpotlightColumn({
  team,
  players,
  tone,
}: {
  team: string;
  players: BroadcasterMatchupPlayer[];
  tone: "coral" | "cyan";
}) {
  return (
    <div className="space-y-3">
      {players.length ? players.map((player) => <SpotlightPlayer key={player.id} player={player} team={team} tone={tone} />) : (
        <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-line bg-navy/40 p-6 text-center text-sm text-steel">
          No rostered player in this role
        </div>
      )}
    </div>
  );
}

function RolePanel({ matchup, teamA, teamB, index }: { matchup: BroadcasterRoleMatchup; teamA: string; teamB: string; index: number }) {
  return (
    <section aria-labelledby={`head-to-head-${matchup.role}-title`} className="space-y-5">
      <div>
        <p className="mono-label text-pink">{String(index + 1).padStart(2, "0")} / 06 · Lane collision</p>
        <h3 id={`head-to-head-${matchup.role}-title`} className="type-display mt-1 text-4xl text-white sm:text-5xl">{matchup.label} lane</h3>
        <p className="mt-2 text-sm text-steel">Cards up. Stats live. Who owns this side of the Rift?</p>
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <SpotlightColumn team={teamA} players={matchup.teamAPlayers} tone="coral" />
        <div className="flex items-center justify-center py-2 lg:sticky lg:top-0 lg:pt-16">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-gold/70 bg-gradient-to-br from-gold/30 to-pink/20 text-sm font-black italic text-gold shadow-[0_0_24px_rgb(245_182_46_/_0.22)]">VS</span>
        </div>
        <SpotlightColumn team={teamB} players={matchup.teamBPlayers} tone="cyan" />
      </div>
    </section>
  );
}

export default function HeadToHeadDialog({
  open,
  onClose,
  teamA,
  teamB,
  matchups,
  returnFocusRef,
}: HeadToHeadDialogProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const sections = [{ id: "overview", label: "Overview" }, ...matchups.map((matchup) => ({ id: matchup.role, label: matchup.label }))];
  const current = sections[activeIndex] ?? sections[0];
  const teamAName = teamName(teamA);
  const teamBName = teamName(teamB);
  const closeDialog = useCallback(() => {
    onClose();
    returnFocusRef?.current?.focus();
  }, [onClose, returnFocusRef]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
      if (event.key === "ArrowRight") setActiveIndex((index) => Math.min(index + 1, sections.length - 1));
      if (event.key === "ArrowLeft") setActiveIndex((index) => Math.max(index - 1, 0));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeDialog, open, sections.length]);

  if (!open) return null;

  const onBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) closeDialog();
  };
  const moveTo = (index: number) => setActiveIndex(Math.max(0, Math.min(index, sections.length - 1)));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="head-to-head-title"
      onClick={onBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[radial-gradient(circle_at_top,rgb(255_61_132_/_0.16),transparent_40%),rgb(0_7_18_/_0.88)] p-2 backdrop-blur-md sm:p-5"
    >
      <div className="relative flex max-h-[calc(100vh-1rem)] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-pink/50 bg-[linear-gradient(135deg,rgb(10_42_71_/_0.98),rgb(0_20_34_/_0.99))] shadow-[0_0_90px_rgb(255_61_132_/_0.2)] sm:max-h-[calc(100vh-2.5rem)]">
        <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-coral via-pink to-purple" />
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6">
          <div>
            <p className="mono-label text-coral">Live broadcast tool · {teamAName} vs {teamBName}</p>
            <h2 id="head-to-head-title" className="type-display mt-1 text-3xl text-white sm:text-4xl">Head-to-head</h2>
            <p className="mt-1 text-xs text-steel">Player cards + season stats for every rivalry on today’s desk.</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={closeDialog}
            aria-label="Close head-to-head"
            className="rounded-full border border-line bg-navy/70 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-steel transition hover:border-coral hover:text-coral"
          >
            Close ×
          </button>
        </header>

        <nav aria-label="Head-to-head sections" className="flex gap-1 overflow-x-auto border-b border-white/10 px-4 py-3 sm:px-6">
          {sections.map((section, index) => (
            <button
              key={section.id}
              type="button"
              aria-current={activeIndex === index ? "step" : undefined}
              onClick={() => moveTo(index)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] transition ${
                activeIndex === index
                  ? "border-coral bg-coral text-navy shadow-[0_0_18px_rgb(255_107_53_/_0.35)]"
                  : "border-line bg-navy/60 text-steel hover:border-pink hover:text-pink"
              }`}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          {current.id === "overview" ? (
            <OverviewPanel teamA={teamA} teamB={teamB} matchups={matchups} onSelect={moveTo} />
          ) : (
            <RolePanel
              matchup={matchups.find((matchup) => matchup.role === current.id) ?? matchups[0]}
              teamA={teamAName}
              teamB={teamBName}
              index={activeIndex}
            />
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-navy/70 px-4 py-3 sm:px-6">
          <p aria-live="polite" className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">
            {current.label} · {activeIndex + 1} of {sections.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => moveTo(activeIndex - 1)}
              disabled={activeIndex === 0}
              className="rounded-full border border-line px-3 py-2 text-xs font-black uppercase tracking-wider text-steel transition hover:border-cyan hover:text-cyan disabled:cursor-not-allowed disabled:opacity-35"
            >
              ← Previous matchup
            </button>
            <button
              type="button"
              onClick={() => moveTo(activeIndex + 1)}
              disabled={activeIndex === sections.length - 1}
              className="btn-rivalry rounded-full px-3 py-2 text-xs uppercase tracking-wider"
            >
              Next matchup →
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
