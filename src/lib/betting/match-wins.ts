export interface MatchWinPayoutLine {
  username: string;
  amount: number;
}

/** Group the database's actual payouts so mixed normal/patron teams read
 * clearly in one Discord announcement. */
export function formatMatchWinPayouts(payouts: MatchWinPayoutLine[]): string {
  const grouped = new Map<number, string[]>();
  for (const payout of payouts) {
    const names = grouped.get(payout.amount) ?? [];
    names.push(payout.username);
    grouped.set(payout.amount, names);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([amount, names]) => `+$${amount} each: ${names.join(", ")}`)
    .join(" · ");
}
