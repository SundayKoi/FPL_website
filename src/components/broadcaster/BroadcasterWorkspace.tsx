"use client";

import { useState } from "react";
import Link from "next/link";
import OpponentScout from "@/components/captain/OpponentScout";
import type { HomepageFeaturedSettings } from "@/lib/home/homepageSettings";
import type { LeagueView } from "@/lib/league/context";
import type { FixtureRow } from "@/lib/schedule/types";
import type { ScoutSource } from "@/lib/scouting/types";
import BroadcasterFixtureHeader from "./BroadcasterFixtureHeader";
import BroadcasterMatchups from "./BroadcasterMatchups";

type WorkspaceTab = "team-a" | "matchups" | "team-b";

export interface BroadcasterWorkspaceProps {
  league: LeagueView;
  fixture: FixtureRow;
  settings: HomepageFeaturedSettings;
  teamA: ScoutSource;
  teamB: ScoutSource;
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
}: BroadcasterWorkspaceProps) {
  const [tab, setTab] = useState<WorkspaceTab>("team-a");
  const teamAName = teamA.teamName ?? teamA.opponentName;
  const teamBName = teamB.teamName ?? teamB.opponentName;
  const tabs: { id: WorkspaceTab; label: string }[] = [
    { id: "team-a", label: `${teamAName} scouting` },
    { id: "matchups", label: "Matchups" },
    { id: "team-b", label: `${teamBName} scouting` },
  ];

  return (
    <section className="space-y-6">
      <BroadcasterFixtureHeader fixture={fixture} twitchUrl={settings.twitchUrl} />

      <nav aria-label="League" className="inline-flex gap-1 rounded-md border border-line bg-navy p-1">
        {leagueLinks.map((link) => {
          const active = link.league === league;
          return <Link
            key={link.league}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center justify-center rounded px-4 py-2 text-xs uppercase tracking-[0.14em] transition ${
              active ? "bg-coral font-bold text-navy" : "text-steel/60 hover:bg-panel hover:text-steel"
            }`}
          >
            {link.label}
          </Link>;
        })}
      </nav>

      <div className="card-brand p-2">
        <div role="tablist" aria-label="Broadcaster workspace" className="flex flex-wrap gap-1">
          {tabs.map((item) => {
            const selected = tab === item.id;
            return <button
              key={item.id}
              id={`broadcaster-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`broadcaster-panel-${item.id}`}
              onClick={() => setTab(item.id)}
              className={`rounded px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                selected ? "bg-coral text-navy" : "text-steel hover:bg-panel hover:text-white"
              }`}
            >
              {item.label}
            </button>;
          })}
        </div>
      </div>

      <div
        id={`broadcaster-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`broadcaster-tab-${tab}`}
      >
        {tab === "team-a" ? <OpponentScout source={teamA} perspective="team" /> : null}
        {tab === "matchups" ? <BroadcasterMatchups teamA={teamA} teamB={teamB} /> : null}
        {tab === "team-b" ? <OpponentScout source={teamB} perspective="team" /> : null}
      </div>
    </section>
  );
}
