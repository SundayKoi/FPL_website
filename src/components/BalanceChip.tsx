import Link from "next/link";
import { fmtPoints } from "@/lib/betting/format";

/**
 * The wallet, as one chip. It had three implementations — the header's,
 * the betting sub-nav's, the cards tab bar's — and was missing on the
 * daily games, the one place money is earned. Always a link to the
 * economy page, which says what the number buys and how to make it grow.
 */
export default function BalanceChip({
  balance,
  size = "sm",
  className = "",
  testId,
}: {
  balance: number;
  size?: "sm" | "md";
  className?: string;
  testId?: string;
}) {
  const sizing = size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-1 text-xs";
  return (
    <Link
      href="/economy"
      title="Your betting dollars — what they buy and every way to earn more"
      aria-label={`Premium wallet balance ${fmtPoints(balance)}`}
      data-testid={testId}
      className={`inline-flex items-center rounded-full border border-gold/40 bg-gold/10 font-mono font-semibold text-gold transition hover:bg-gold/20 ${sizing} ${className}`}
    >
      {fmtPoints(balance)}
    </Link>
  );
}
