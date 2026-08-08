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
    <section className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <h3 className="text-sm font-semibold text-zinc-300">Bid feed</h3>
      <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto text-xs">
        {sorted.map((bid) => (
          <li key={bid.id} className="rounded border border-zinc-800 bg-black/20 px-2 py-1 text-zinc-300">
            <span className="font-semibold text-zinc-100">{teamName(bid.team_id)}</span> bid{" "}
            <span className="font-mono text-emerald-400">{bid.amount}</span> on {playerName(bid.lot_id)}
          </li>
        ))}
        {sorted.length === 0 && <li className="py-4 text-center text-zinc-600">No bids yet.</li>}
      </ul>
    </section>
  );
}
