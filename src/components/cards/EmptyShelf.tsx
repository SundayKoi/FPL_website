import Link from "next/link";

/**
 * What a game or a market says when the viewer owns nothing yet: one
 * sentence that names what the page is for, and the one button that fixes
 * it. Every Play page and the market used to say it differently, or say
 * "open a pack" with nothing to click.
 */
export default function EmptyShelf({ base, goal }: { base: string; goal: string }) {
  return (
    <div className="card-brand flex flex-wrap items-center justify-between gap-3 p-5" data-testid="empty-shelf">
      <p className="text-sm text-steel">You don&apos;t own any cards yet. Open a pack to {goal}.</p>
      <Link href={`${base}/packs`} className="btn-coral px-4 py-2 text-sm">
        Open a pack →
      </Link>
    </div>
  );
}
