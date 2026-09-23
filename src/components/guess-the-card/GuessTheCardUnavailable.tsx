import Link from "next/link";

export default function GuessTheCardUnavailable({ league }: { league: string }) {
  return (
    <main className="page-container page-spacing page-backdrop flex w-full flex-1 flex-col items-center justify-center text-center text-white">
      <span className="label-dash">{league} · Guess the Card</span>
      <h1 className="type-display mt-3 text-4xl">Guess the Card warming up</h1>
      <p className="mt-4 max-w-lg text-sm leading-6 text-muted">
        This puzzle needs a complete current-season game before it can be frozen. Check back after the next eligible match is ingested.
      </p>
      <Link href="/premium" className="mt-7 rounded border border-coral/60 px-4 py-2 text-xs font-bold uppercase tracking-wide text-coral transition hover:bg-coral/10">
        Back to Premium HQ
      </Link>
    </main>
  );
}
