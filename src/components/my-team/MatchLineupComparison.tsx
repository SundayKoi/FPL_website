import { ROLE_LABELS } from "@/lib/draft/types";
import type { LineupSlot } from "@/lib/my-team/presentation";
import OpggMultiLink from "@/components/captain/OpggMultiLink";

function PlayerCell({
  player,
  viewer,
  missingLabel,
}: {
  player: LineupSlot["mine"];
  viewer?: boolean;
  missingLabel: string;
}) {
  if (!player) return <span className="text-sm text-muted">{missingLabel}</span>;
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-white">
      <span className="min-w-0 truncate" title={player.display_name}>{player.display_name}</span>
      {viewer ? <span className="shrink-0 rounded border border-success/50 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-success">You</span> : null}
    </span>
  );
}

export function MatchLineupComparison({
  myTeamName,
  opponentName,
  slots,
  myMultiOpggUrl,
  opponentMultiOpggUrl,
  opponentUnavailable,
}: {
  myTeamName: string;
  opponentName: string;
  slots: LineupSlot[];
  myMultiOpggUrl: string | null;
  opponentMultiOpggUrl: string | null;
  opponentUnavailable: boolean;
}) {
  return (
    <section className="card-brand p-5" aria-label="Match lineups">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label-dash">Roster comparison</p>
          <h2 className="mt-1 type-display text-2xl">Match lineups</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {myMultiOpggUrl ? <OpggMultiLink href={myMultiOpggUrl} label={`${myTeamName} OP.GG Multi`} /> : null}
          {opponentMultiOpggUrl ? <OpggMultiLink href={opponentMultiOpggUrl} label={`${opponentName} OP.GG Multi`} /> : null}
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left">
          <caption className="sr-only">{myTeamName} and {opponentName} lineups by role</caption>
          <thead>
            <tr className="border-b border-border-subtle/60 text-xs uppercase tracking-[0.12em] text-muted">
              <th scope="col" className="w-24 px-2 py-2">Role</th>
              <th scope="col" className="px-2 py-2">{myTeamName}</th>
              <th scope="col" className="px-2 py-2">{opponentName}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle/50">
            {slots.map((slot) => (
              <tr key={slot.role}>
                <th scope="row" className="px-2 py-3 text-xs font-semibold uppercase tracking-wide text-prestige">{ROLE_LABELS[slot.role]}</th>
                <td className="max-w-[14rem] px-2 py-3"><PlayerCell player={slot.mine} viewer={slot.viewerIsMine} missingLabel="Open" /></td>
                <td className="max-w-[14rem] px-2 py-3"><PlayerCell player={slot.opponent} missingLabel={opponentUnavailable ? "Unavailable" : "Not listed"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
