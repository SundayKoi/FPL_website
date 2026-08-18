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
}: {
  draftPlayers: Player[];
  riotAccounts: (RiotAccount & { membershipId: string })[];
  multiOpggUrl?: string | null;
}) {
  const byRole = [...draftPlayers].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
  );

  return (
    <section className="card-brand p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="label-dash">My roster</h2>
        {multiOpggUrl ? <OpggMultiLink href={multiOpggUrl} label="My Team OP.GG Multi" /> : null}
      </div>

      {byRole.length === 0 ? (
        <p className="mt-3 text-sm text-steel">No draft roster on record yet for this team.</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-line/60">
          {byRole.map((player) => (
            <li key={player.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-steel">
                {ROLE_LABELS[player.role]}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                {player.display_name}
              </span>
              {player.price !== null && (
                <span className="shrink-0 text-sm font-semibold text-gold">{player.price}</span>
              )}
              {player.acquisition && (
                <span className="shrink-0 rounded border border-steel/50 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-steel">
                  {ACQUISITION_LABELS[player.acquisition] ?? player.acquisition}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3 className="label-dash mt-5">Riot IDs on record</h3>
      {riotAccounts.length === 0 ? (
        <p className="mt-3 text-sm text-steel">No Riot IDs linked to this team yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {riotAccounts.map((account) => (
            <li key={account.membershipId} className="flex flex-wrap items-center gap-2 text-sm">
              <code className="font-mono text-white">
                {account.game_name}#{account.tag_line}
              </code>
              {account.display_name && <span className="text-steel">({account.display_name})</span>}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-steel">
        See something wrong here? Tell an admin — rosters and Riot IDs are edited by league admins only.
      </p>
    </section>
  );
}
