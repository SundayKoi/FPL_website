"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import OpponentScout from "@/components/captain/OpponentScout";
import type { HomepageFeaturedSettings } from "@/lib/home/homepageSettings";
import type { LeagueView } from "@/lib/league/context";
import type { FixtureRow } from "@/lib/schedule/types";
import type { BroadcasterPlayerDetails } from "@/lib/broadcaster/types";
import { deriveBroadcasterMatchups } from "@/lib/broadcaster/matchups";
import type { ScoutScope, ScoutSource } from "@/lib/scouting/types";
import BroadcasterFixtureHeader from "./BroadcasterFixtureHeader";
import BroadcasterMatchups from "./BroadcasterMatchups";
import HeadToHeadDialog from "./HeadToHeadDialog";

type WorkspaceTab = "team-a" | "matchups" | "team-b";

export interface BroadcasterWorkspaceProps {
  league: LeagueView;
  fixture: FixtureRow;
  settings: HomepageFeaturedSettings;
  teamA: ScoutSource;
  teamB: ScoutSource;
  playerDetails?: BroadcasterPlayerDetails[];
}

const leagueLinks: { league: LeagueView; label: string; href: string }[] = [
  { league: "premier", label: "Premier", href: "/broadcaster?league=premier" },
  { league: "academy", label: "Academy", href: "/broadcaster?league=academy" },
];

export default function BroadcasterWorkspace({
  league,
  fixture,
  settings,
  teamA,
  teamB,
  playerDetails,
}: BroadcasterWorkspaceProps) {
  const [tab, setTab] = useState<WorkspaceTab>("team-a");
  const [scope, setScope] = useState<ScoutScope>("season");
  const [headToHeadOpen, setHeadToHeadOpen] = useState(false);
  const headToHeadTriggerRef = useRef<HTMLButtonElement | null>(null);
  const teamAName = teamA.teamName ?? teamA.opponentName;
  const teamBName = teamB.teamName ?? teamB.opponentName;
  const matchups = useMemo(
    () => deriveBroadcasterMatchups(teamA, teamB, scope, playerDetails),
    [teamA, teamB, scope, playerDetails],
  );
  const tabs: { id: WorkspaceTab; label: string }[] = [
    { id: "team-a", label: `${teamAName} scouting` },
    { id: "matchups", label: "Matchups" },
    { id: "team-b", label: `${teamBName} scouting` },
  ];
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectTabFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    setTab(tabs[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <section className="space-y-6">
      <BroadcasterFixtureHeader
        fixture={fixture}
        twitchUrl={settings.twitchUrl}
        onOpenHeadToHead={() => setHeadToHeadOpen(true)}
        headToHeadTriggerRef={headToHeadTriggerRef}
      />

      <nav aria-label="League" className="inline-flex gap-1 rounded-md border border-border-strong bg-canvas p-1">
        {leagueLinks.map((link) => {
          const active = link.league === league;
          return <Link
            key={link.league}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center justify-center rounded px-4 py-2 text-xs uppercase tracking-[0.14em] transition ${
              active ? "bg-action-fill font-bold text-white" : "text-muted/60 hover:bg-surface hover:text-action-text"
            }`}
          >
            {link.label}
          </Link>;
        })}
      </nav>

      <div className="card-brand p-2">
        <div role="tablist" aria-label="Broadcaster workspace" className="flex flex-wrap gap-1">
          {tabs.map((item, index) => {
            const selected = tab === item.id;
            return <button
              key={item.id}
              ref={(node) => { tabRefs.current[index] = node; }}
              id={`broadcaster-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`broadcaster-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(item.id)}
              onKeyDown={(event) => selectTabFromKeyboard(event, index)}
              className={`rounded px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                selected ? "bg-action-fill text-white" : "text-muted hover:bg-surface hover:text-white"
              }`}
            >
              {item.label}
            </button>;
          })}
        </div>
      </div>

      {tabs.map((item) => {
        const selected = tab === item.id;
        return <div
          key={item.id}
          id={`broadcaster-panel-${item.id}`}
          role="tabpanel"
          aria-labelledby={`broadcaster-tab-${item.id}`}
          hidden={!selected}
        >
          {selected && item.id === "team-a" ? <OpponentScout source={teamA} perspective="team" /> : null}
          {selected && item.id === "matchups" ? (
            <BroadcasterMatchups
              teamA={teamA}
              teamB={teamB}
              playerDetails={playerDetails}
              scope={scope}
              onScopeChange={setScope}
              matchups={matchups}
            />
          ) : null}
          {selected && item.id === "team-b" ? <OpponentScout source={teamB} perspective="team" /> : null}
        </div>;
      })}

      {headToHeadOpen ? (
        <HeadToHeadDialog
          open
          onClose={() => setHeadToHeadOpen(false)}
          teamA={teamA}
          teamB={teamB}
          matchups={matchups}
          returnFocusRef={headToHeadTriggerRef}
        />
      ) : null}
    </section>
  );
}
