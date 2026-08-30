import Link from "next/link";

export default function HigherLowerAccessNotice({ league }: { league: string }) {
  return (
    <main className="bg-hash flex flex-1 items-center justify-center px-6 py-20">
      <section className="card-brand flex w-full max-w-2xl flex-col items-center gap-5 p-8 text-center sm:p-12">
        <span className="label-dash">{league} Daily · Early access</span>
        <h1 className="type-display text-4xl sm:text-5xl">Patron early access</h1>
        <p className="max-w-xl text-sm leading-7 text-steel sm:text-base">
          Patrons get early access to new features, including Higher or Lower. Want to play? Become a patron to
          unlock this game.
        </p>
        <p className="max-w-lg text-xs leading-5 text-steel">
          Access is currently limited to active patrons, admins, and owners.
        </p>
        <Link href="/support-devs" className="btn-coral inline-flex items-center px-5 py-3 text-sm uppercase tracking-wide">
          View Patron Benefits →
        </Link>
      </section>
    </main>
  );
}
