import Link from "next/link";

export default function HigherLowerAccessNotice({ league }: { league: string }) {
  return (
    <main className="bg-hash flex flex-1 items-center justify-center px-6 py-20">
      <section className="card-brand flex w-full max-w-2xl flex-col items-center gap-5 p-8 text-center sm:p-12">
        <span className="label-dash">{league} Daily · Premium</span>
        <h1 className="type-display text-4xl sm:text-5xl">Premium members only</h1>
        <p className="max-w-xl text-sm leading-7 text-muted sm:text-base">
          Premium members can play Higher or Lower. Join FPL Premium to unlock this daily card game.
        </p>
        <p className="max-w-lg text-xs leading-5 text-muted">
          Access is available to Premium members, admins, and owners.
        </p>
        <Link href="/premium" className="btn-primary inline-flex items-center px-5 py-3 text-sm uppercase tracking-wide">
          Open Premium HQ →
        </Link>
      </section>
    </main>
  );
}
