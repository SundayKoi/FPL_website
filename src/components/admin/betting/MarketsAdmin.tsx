"use client";
import { useState } from "react";
import { StatusPill } from "@/components/betting/StatusPill";
import { fmtPoints, toIso } from "@/lib/betting/format";
import type { BettingTeam, MarketStatus } from "@/lib/betting/types";
import { createMarket, resolveMarket, cancelMarket, deleteMarket } from "@/lib/betting/admin-actions";
import { ErrorBanner, useAdminRun } from "./useAdminRun";

export interface AdminMarketRow {
  id: number;
  title: string | null;
  status: MarketStatus;
  event_id: number;
  event_name: string;
  team_a: BettingTeam;
  team_b: BettingTeam;
  game_at: string;
  lock_at: string;
  winning_team_id: number | null;
  drawn: boolean;
  draw_enabled: boolean;
  rake_bps: number;
  volume: number;
}

function CreateMarketForm({
  teams,
  events,
  busy,
  onCreate,
}: {
  teams: BettingTeam[];
  events: { id: number; name: string }[];
  busy: boolean;
  onCreate: (input: {
    eventId: number;
    teamAId: number;
    teamBId: number;
    title: string;
    gameAt: string;
    rakeBps: number;
    drawEnabled: boolean;
  }) => void;
}) {
  const [eventId, setEventId] = useState(events[0]?.id ?? 0);
  const [teamAId, setTeamAId] = useState(teams[0]?.id ?? 0);
  const [teamBId, setTeamBId] = useState(teams[1]?.id ?? 0);
  const [title, setTitle] = useState("");
  const [gameAt, setGameAt] = useState("");
  const [rakeBps, setRakeBps] = useState(0);
  const [drawEnabled, setDrawEnabled] = useState(false);

  const canSubmit = eventId && teamAId && teamBId && teamAId !== teamBId && title.trim() && gameAt;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onCreate({ eventId, teamAId, teamBId, title: title.trim(), gameAt: toIso(gameAt), rakeBps, drawEnabled });
      }}
      className="card-brand flex flex-col gap-3 p-4"
    >
      <h2 className="label-dash">New market</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-steel">
          Event
          <select
            value={eventId}
            onChange={(e) => setEventId(Number(e.target.value))}
            className="input-brand px-2 py-1.5 text-sm"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-steel">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. TSM vs C9"
            className="input-brand px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-steel">
          Team A
          <select
            value={teamAId}
            onChange={(e) => setTeamAId(Number(e.target.value))}
            className="input-brand px-2 py-1.5 text-sm"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-steel">
          Team B
          <select
            value={teamBId}
            onChange={(e) => setTeamBId(Number(e.target.value))}
            className="input-brand px-2 py-1.5 text-sm"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-steel">
          Game time
          <input
            type="datetime-local"
            value={gameAt}
            onChange={(e) => setGameAt(e.target.value)}
            className="input-brand px-2 py-1.5 text-sm"
          />
          <span className="text-[10px] text-steel/70">Locks automatically at this time.</span>
        </label>
        <label className="flex flex-col gap-1 text-xs text-steel">
          Rake (bps)
          <input
            type="number"
            min={0}
            max={10000}
            value={rakeBps}
            onChange={(e) => setRakeBps(Math.max(0, Math.min(10000, Number(e.target.value) || 0)))}
            className="input-brand px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-steel">
        <input type="checkbox" checked={drawEnabled} onChange={(e) => setDrawEnabled(e.target.checked)} />
        Allow a draw (3-way market)
      </label>
      <button
        type="submit"
        disabled={!canSubmit || busy}
        className="self-start btn-coral px-4 py-2 text-sm"
      >
        Create market
      </button>
    </form>
  );
}

function ResolveControl({ market, busy, onResolve }: { market: AdminMarketRow; busy: boolean; onResolve: (winner: number) => void }) {
  const [winner, setWinner] = useState<number>(market.team_a.id);
  return (
    <div className="flex items-center gap-2">
      <select
        value={winner}
        onChange={(e) => setWinner(Number(e.target.value))}
        className="rounded border border-line bg-navy px-2 py-1 text-xs text-white focus:border-coral focus:outline-none"
      >
        <option value={market.team_a.id}>{market.team_a.short_code} wins</option>
        <option value={market.team_b.id}>{market.team_b.short_code} wins</option>
        {market.draw_enabled && <option value={-1}>Draw</option>}
      </select>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (confirm(`Resolve "${market.title ?? market.id}"? This pays out bettors immediately.`)) onResolve(winner);
        }}
        className="rounded border border-mint/60 px-2 py-1 text-xs font-semibold text-mint disabled:opacity-40"
      >
        Resolve
      </button>
    </div>
  );
}

export default function MarketsAdmin({
  markets,
  teams,
  events,
}: {
  markets: AdminMarketRow[];
  teams: BettingTeam[];
  events: { id: number; name: string }[];
}) {
  const { error, pending, run } = useAdminRun();

  return (
    <div className="flex flex-col gap-6">
      <ErrorBanner error={error} />

      <CreateMarketForm teams={teams} events={events} busy={pending} onCreate={(input) => run(() => createMarket(input))} />

      <div className="flex flex-col gap-2">
        <h2 className="label-dash">Markets ({markets.length})</h2>
        {markets.length === 0 ? (
          <p className="text-sm text-steel">No markets yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {markets.map((m) => (
              <li key={m.id} className="card-brand flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={m.status} />
                    <span className="truncate font-medium text-white">
                      {m.title ?? `${m.team_a.short_code} vs ${m.team_b.short_code}`}
                    </span>
                    <span className="text-xs text-steel">· {m.event_name}</span>
                  </div>
                  <div className="text-xs text-steel">
                    {new Date(m.game_at).toLocaleString()} · Volume {fmtPoints(m.volume)}
                    {m.status === "RESOLVED" && (
                      <> · Winner: {m.drawn ? "Draw" : m.winning_team_id === m.team_a.id ? m.team_a.short_code : m.team_b.short_code}</>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {(m.status === "OPEN" || m.status === "LOCKED") && (
                    <>
                      <ResolveControl
                        market={m}
                        busy={pending}
                        onResolve={(winner) => run(() => resolveMarket(m.id, winner))}
                      />
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (confirm(`Cancel "${m.title ?? m.id}"? Every bet is refunded.`)) {
                            run(() => cancelMarket(m.id));
                          }
                        }}
                        className="rounded border border-line px-2 py-1 text-xs text-steel hover:border-red-400 hover:text-red-300 disabled:opacity-40"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Delete "${m.title ?? m.id}"? Only possible if it has no bets.`)) {
                        run(() => deleteMarket(m.id));
                      }
                    }}
                    className="rounded border border-red-500/60 px-2 py-1 text-xs font-semibold text-red-400 disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
