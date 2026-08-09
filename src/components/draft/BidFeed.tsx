import type { Bid, Lot, Player, Team } from "@/lib/draft/types";

export default function BidFeed({
  bids,
  teams,
  players,
  lots,
}: {
  bids: Bid[];
  teams: Team[];
  players: Player[];
  lots: Lot[];
}) {
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "Unknown team";
  const playerName = (lotId: string) => {
    const lot = lots.find((l) => l.id === lotId);
    const player = lot ? players.find((p) => p.id === lot.player_id) : null;
    return player?.display_name ?? "?";
  };

  const sorted = [...bids].sort((a, b) => b.id - a.id);

  return (
    <section className="card-brand flex flex-col gap-2 p-3">
      <h3 className="label-dash">Bid feed</h3>
      <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto text-xs">
        {sorted.map((bid) => (
          <li key={bid.id} className="border-b border-line/50 px-1 py-1.5">
            <span className="font-semibold text-white">{teamName(bid.team_id)}</span> bid{" "}
            <span className="font-display font-semibold not-italic text-gold">{bid.amount}</span> on{" "}
            <span className="text-steel">{playerName(bid.lot_id)}</span>
          </li>
        ))}
        {sorted.length === 0 && <li className="py-4 text-center text-steel">No bids yet.</li>}
      </ul>
    </section>
  );
}
