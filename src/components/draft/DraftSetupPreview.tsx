import Link from "next/link";
import { ROLE_ORDER, type Draft, type Player, type Team } from "@/lib/draft/types";
import DraftScheduleCountdown from "./DraftScheduleCountdown";

const ROLE_LABELS = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  adc: "ADC",
  support: "Support",
} as const;

export default function DraftSetupPreview({
  draft,
  teams,
  players,
}: {
  draft: Draft;
  teams: Team[];
  players: Player[];
}) {
  const availablePlayers = players.filter((player) => player.team_id === null);
  const startsAt = draft.starts_at ?? null;

  return (
    <div className="flex flex-col gap-4">
      <section className="card-brand overflow-hidden border-cyan/40 bg-gradient-to-br from-cyan/10 via-panel to-panel p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <span className="label-dash text-cyan">SPECTATOR PREVIEW · SETUP</span>
            <h2 className="type-display mt-3 text-4xl text-white sm:text-5xl">The room is being set.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-steel">
              This read-only preview shows the teams, order, budgets, and player pool before nominations and bidding begin.
            </p>
            <DraftScheduleCountdown startsAt={startsAt} label="Draft start countdown" />
          </div>
          <Link
            href="/draft"
            className="rounded border border-line px-3 py-2 text-sm font-semibold text-steel hover:border-gold hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            ← Draft Central
          </Link>
        </div>
      </section>

      <section aria-labelledby="preview-pool-title" className="card-brand p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="label-dash">THE PLAYER POOL</span>
            <h3 id="preview-pool-title" className="type-display mt-2 text-2xl text-white">Available players</h3>
          </div>
          <span className="text-xs uppercase tracking-wide text-steel">{availablePlayers.length} available</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {ROLE_ORDER.map((role) => {
            const rolePlayers = availablePlayers.filter((player) => player.role === role);
            return (
              <section key={role} className="overflow-hidden rounded border border-line">
                <h4 className="border-b border-line bg-navy px-3 py-2 text-xs font-bold uppercase tracking-wide text-steel">{ROLE_LABELS[role]}</h4>
                <ul className="divide-y divide-line/60">
                  {rolePlayers.map((player) => (
                    <li key={player.id} className="flex items-center justify-between gap-2 bg-panel px-3 py-2 text-xs">
                      <span className="min-w-0 truncate font-semibold text-white">{player.display_name}</span>
                      <span className="shrink-0 text-[10px] uppercase text-steel">{player.rank ?? "Unranked"}</span>
                    </li>
                  ))}
                  {rolePlayers.length === 0 && <li className="bg-panel px-3 py-3 text-center text-[10px] text-steel">No players</li>}
                </ul>
              </section>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="preview-teams-title">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <span className="label-dash">THE FRANCHISES</span>
            <h3 id="preview-teams-title" className="type-display mt-2 text-2xl text-white">Draft order & budgets</h3>
          </div>
          <span className="text-xs uppercase tracking-wide text-steel">{teams.length} teams ready</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[...teams].sort((left, right) => left.nomination_position - right.nomination_position).map((team) => (
            <article key={team.id} className="card-brand overflow-hidden">
              <div className="h-1.5" style={{ backgroundColor: team.banner_color ?? "#f0b429" }} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-mono text-xs font-semibold text-steel">#{team.nomination_position} · {team.abbreviation}</span>
                    <h4 className="mt-1 text-lg font-semibold text-white">{team.name}</h4>
                  </div>
                  <span className="rounded-full border border-cyan/40 bg-cyan/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan">
                    {team.captain_profile_id ? "Captain assigned" : "Captain pending"}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-steel">
                  <span>Budget remaining</span>
                  <span className="font-mono font-bold text-gold">{team.points_remaining} / {team.budget_start}</span>
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-1.5">
                  {ROLE_ORDER.map((role) => {
                    const rosterPlayer = players.find((player) => player.team_id === team.id && player.role === role);
                    return (
                    <li
                      key={role}
                      className={`rounded px-2 py-1.5 text-xs ${rosterPlayer ? "border border-line bg-navy/40 text-white" : "border border-dashed border-line text-steel/70"}`}
                    >
                      <span className="uppercase tracking-wide">{ROLE_LABELS[role]}</span>
                      {rosterPlayer ? (
                        <span className="mt-1 flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate font-semibold">
                            {rosterPlayer.display_name}
                            <span className="ml-1 font-normal text-steel">· {rosterPlayer.rank ?? "Unranked"}</span>
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-gold">{rosterPlayer.price ?? 0}</span>
                        </span>
                      ) : (
                        <span className="ml-1 text-steel">—</span>
                      )}
                    </li>
                    );
                  })}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card-brand border-dashed border-line p-6 text-center">
        <span className="label-dash text-gold">LIVE DRAFT CENTER</span>
        <p className="mt-3 text-sm text-steel">Nominations, bids, and the live board will appear here when the admin starts the draft.</p>
      </section>
    </div>
  );
}
