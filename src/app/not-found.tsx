import Link from "next/link";

/**
 * The styled 404. Every missing match, market or card used to show the
 * framework's default. Says what happened, and offers the four places
 * people were most likely trying to reach.
 */
export default function NotFound() {
  return (
    <main className="page-backdrop flex flex-1 flex-col items-center justify-center gap-5 px-6 py-24 text-center text-white">
      <span className="label-dash">404</span>
      <h1 className="type-display text-4xl sm:text-5xl">Nothing here</h1>
      <p className="max-w-md text-sm leading-6 text-muted">
        That page does not exist, or the thing it pointed at — a match, a market, a card — is gone. If you followed a
        link from the Discord, it may be from a season that has been archived.
      </p>
      <nav aria-label="Where to instead" className="flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn-primary px-5 py-3 text-sm uppercase tracking-wide">
          Home
        </Link>
        <Link href="/schedule" className="btn-pill text-sm">
          Schedule
        </Link>
        <Link href="/cards/browse" className="btn-pill text-sm">
          Browse the cards
        </Link>
        <Link href="/premium" className="btn-pill text-sm">
          Premium HQ
        </Link>
      </nav>
      <p className="text-xs text-muted">
        Or press <kbd className="rounded border border-line px-1 font-mono">⌘K</kbd> and search for it.
      </p>
    </main>
  );
}
