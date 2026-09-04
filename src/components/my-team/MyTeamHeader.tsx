import type { ReactNode } from "react";
import type { MyTeamReadyDashboard } from "@/lib/my-team/types";
import type { SeriesRecord } from "@/lib/my-team/presentation";
import { teamAccentFadeStyle } from "./TeamAccentPanel";

export function MyTeamHeader({
  team,
  season,
  record,
}: {
  team: MyTeamReadyDashboard["team"];
  season: string;
  record: SeriesRecord;
}): ReactNode {
  return (
    <header className="card-brand relative overflow-hidden border-t-4 p-5 sm:p-6" style={{ borderTopColor: team.bannerColor }}>
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={teamAccentFadeStyle(team.bannerColor)} />
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-white/25 bg-canvas/60 p-2 shadow-lg">
          {team.imageUrl ? (
            // Deployment-specific Supabase Storage hosts make next/image remotePatterns brittle here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={team.imageUrl} alt={`${team.name} logo`} className="h-full w-full rounded object-contain" />
          ) : (
            <span className="type-display text-2xl text-white/90" aria-hidden="true">{team.abbreviation}</span>
          )}
        </div>
        <div className="min-w-0">
          <span className="label-dash">My Team · {season}</span>
          <h1 className="type-display mt-1 text-3xl sm:text-4xl">{team.name}</h1>
        </div>
        <div className="ml-auto text-right">
          <p className="mono-label">Series record</p>
          <p className="mt-1 font-mono text-lg tabular-nums text-white">{record.wins}W · {record.losses}L</p>
        </div>
      </div>
    </header>
  );
}
