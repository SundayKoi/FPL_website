import Link from "next/link";
import { ROLE_LABELS, ROLE_ORDER } from "@/lib/draft/types";
import { leaderboards } from "@/lib/offseason/ratings";
import type { OffseasonView } from "@/lib/offseason/view";
import { Empty, Overall, tdClass, thClass } from "./ui";

/** Each role's players, best first, with the lowest rated active players marked. */
export default function Leaderboards({ view, atRisk }: { view: OffseasonView; atRisk: Set<string> }) {
  const boards = leaderboards(view.entrants, view.ratings);
  if (ROLE_ORDER.every((role) => boards[role].length === 0)) {
    return <Empty>Roles are assigned once sign-ups close.</Empty>;
  }
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {ROLE_ORDER.map((role) => (
        <div key={role} className="min-w-0">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{ROLE_LABELS[role]}</h3>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className={`${thClass} w-8`}>#</th>
                <th className={thClass}>Player</th>
                <th className={`${thClass} text-right`}>OVR</th>
                <th className={`${thClass} text-right`}>W–L</th>
              </tr>
            </thead>
            <tbody>
              {boards[role].map((entrant, index) => {
                const rating = view.ratings.get(entrant.id);
                return (
                  <tr key={entrant.id} className={entrant.status === "eliminated" ? "opacity-50" : undefined}>
                    <td className={`${tdClass} tabular-nums text-muted`}>{index + 1}</td>
                    <td className={`${tdClass} max-w-0 truncate`}>
                      <Link href={`/offseason/players/${entrant.id}`} className="hover:text-action-text">
                        {entrant.display_name}
                      </Link>
                      {entrant.status === "eliminated" ? (
                        <span className="ml-1.5 text-[0.65rem] font-bold uppercase text-danger">Out W{entrant.eliminated_week}</span>
                      ) : entrant.status === "benched" ? (
                        <span className="ml-1.5 text-[0.65rem] font-bold uppercase text-muted">Bench</span>
                      ) : atRisk.has(entrant.id) ? (
                        <span className="ml-1.5 text-[0.65rem] font-bold uppercase text-prestige">Bottom</span>
                      ) : null}
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <Overall value={rating?.overall} />
                    </td>
                    <td className={`${tdClass} text-right tabular-nums text-muted`}>
                      {rating?.games ? `${rating.wins}–${rating.losses}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
