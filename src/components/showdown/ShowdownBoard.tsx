// The week's board: who is up, the biggest pot, the best hand. Bragging
// rights, not a payout — and on practice tables, in play chips.

import Link from "next/link";
import { fmtPoints } from "@/lib/betting/format";
import { PRACTICE_ONLY } from "@/lib/showdown/config";
import type { WeekBoard } from "@/lib/showdown/leaderboard";
import { editionLabel } from "@/lib/packs/week";

export default function ShowdownBoard({ week, board }: { week: string; board: WeekBoard }) {
  return (
    <section aria-label="This week's board" className="card-brand flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="label-dash">This week · {editionLabel(week)}</span>
        <span className="text-xs text-steel">
          {board.hands} hand{board.hands === 1 ? "" : "s"}
          {PRACTICE_ONLY ? " · play chips" : board.raked > 0 ? ` · ${fmtPoints(board.raked)} raked` : ""}
        </span>
      </div>
      {board.hands === 0 ? (
        <p className="text-sm text-steel">No hands yet this week. The first one dealt goes here.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr]">
          <ol className="flex flex-col gap-1 text-sm">
            {board.standings.slice(0, 8).map((standing, index) => (
              <li key={standing.discordId} className="flex items-center justify-between gap-3 border-b border-line/60 py-1">
                <span className="truncate">
                  <span className="mr-2 font-mono text-xs text-steel">{index + 1}</span>
                  <span className="font-semibold text-white">{standing.username}</span>
                  <span className="ml-2 text-xs text-steel">
                    {standing.won} of {standing.hands}
                  </span>
                </span>
                <span className={`type-display text-sm ${standing.net >= 0 ? "text-mint" : "text-coral"}`}>
                  {standing.net >= 0 ? "+" : ""}
                  {fmtPoints(standing.net)}
                </span>
              </li>
            ))}
          </ol>
          <dl className="flex flex-col gap-2 text-sm">
            {board.biggestPot ? (
              <div>
                <dt className="text-xs uppercase tracking-wider text-steel">Biggest pot</dt>
                <dd>
                  <Link href={`/cards/showdown/${board.biggestPot.tableId}`} className="text-white hover:text-coral">
                    {fmtPoints(board.biggestPot.pot)} · {board.biggestPot.winners.join(" & ")}
                  </Link>
                </dd>
              </div>
            ) : null}
            {board.bestHand ? (
              <div>
                <dt className="text-xs uppercase tracking-wider text-steel">Best hand</dt>
                <dd>
                  <Link href={`/cards/showdown/${board.bestHand.tableId}`} className="text-white hover:text-coral">
                    <span className={board.bestHand.rank === "foil_royal" ? "text-gold" : ""}>{board.bestHand.label}</span> · {board.bestHand.username}
                  </Link>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      )}
    </section>
  );
}
