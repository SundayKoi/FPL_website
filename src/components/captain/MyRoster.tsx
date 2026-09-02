import { ROLE_LABELS, ROLE_ORDER, type Player } from "@/lib/draft/types";
import type { RiotAccount } from "@/lib/matches/types";
import OpggMultiLink from "./OpggMultiLink";

const ACQUISITION_LABELS: Record<string, string> = {
  captain: "Captain",
  free_agency: "Free agency",
  auction: "Auction",
  admin: "Admin-assigned",
};

/**
 * Section 4 of the captain page: the featured-draft roster (role, player,
 * price/acquisition) plus the Riot IDs on record for this team this season.
 * Both read-only — self-serve editing was explicitly not requested; the
 * admin roster editor remains the only writer.
 */
export default function MyRoster({
  draftPlayers,
  riotAccounts,
  multiOpggUrl = null,
  playerPoolId = null,
}: {
  draftPlayers: Player[];
  riotAccounts: (RiotAccount & { membershipId: string })[];
  multiOpggUrl?: string | null;
  /** Stable canonical identity for highlighting the signed-in roster member. */
  playerPoolId?: string | null;
}) {
  const byRole = [...draftPlayers].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
  );

  return (
    <details className="card-brand group overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
        <span role="heading" aria-level={2} className="label-dash">My roster</span>
        <span aria-hidden className="text-xl leading-none text-primary transition group-open:rotate-45">+</span>
      </summary>
      <section aria-label="My roster" className="border-t border-border px-5 pb-5 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {multiOpggUrl ? <OpggMultiLink href={multiOpggUrl} label="My Team OP.GG Multi" /> : null}
      </div>

      {byRole.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No draft roster on record yet for this team.</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-border/60">
          {byRole.map((player) => {
            const isViewer = Boolean(playerPoolId && player.canonical_player_id === playerPoolId);
            return (
              <li
                key={player.id}
                aria-current={isViewer ? "true" : undefined}
                className={`flex flex-wrap items-center gap-3 py-2 ${isViewer ? "rounded border-l-2 border-success bg-success/5 pl-2" : ""}`}
              >
                <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
                  {ROLE_LABELS[player.role]}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                  {player.display_name}
                </span>
                {isViewer ? (
                  <span className="shrink-0 rounded border border-success/50 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-success">
                    You
                  </span>
                ) : null}
                {player.price !== null && (
                  <span className="shrink-0 text-sm font-semibold text-prestige">{player.price}</span>
                )}
                {player.acquisition && (
                  <span className="shrink-0 rounded border border-muted/50 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted">
                    {ACQUISITION_LABELS[player.acquisition] ?? player.acquisition}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="label-dash mt-5">Riot IDs on record</h3>
      {riotAccounts.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No Riot IDs linked to this team yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {riotAccounts.map((account) => (
            <li key={account.membershipId} className="flex flex-wrap items-center gap-2 text-sm">
              <code className="font-mono text-white">
                {account.game_name}#{account.tag_line}
              </code>
              {account.display_name && <span className="text-muted">({account.display_name})</span>}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-muted">
        See something wrong here? Tell an admin — rosters and Riot IDs are edited by league admins only.
      </p>
      </section>
    </details>
  );
}
