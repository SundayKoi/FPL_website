export default function HigherLowerUnavailable({ league }: { league: string }) {
  return (
    <main className="page-backdrop flex flex-1 items-center justify-center px-6 py-20">
      <section className="card-brand w-full max-w-2xl p-8 text-center sm:p-12">
        <span className="label-dash">{league} Daily</span>
        <h1 className="type-display mt-2 text-4xl">Higher or Lower is resting</h1>
        <p className="mt-4 text-sm leading-7 text-muted">
          A frozen card edition is not available yet. Check back after the next card archive is published.
        </p>
      </section>
    </main>
  );
}
