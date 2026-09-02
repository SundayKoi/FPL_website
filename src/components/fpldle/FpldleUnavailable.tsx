export default function FpldleUnavailable({ league }: { league: string }) {
  return (
    <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <span className="label-dash">{league} FPL&apos;dle</span>
      <h1 className="type-display text-3xl sm:text-4xl">Puzzle warming up</h1>
      <p className="max-w-md text-sm text-muted">
        A frozen card edition is needed before today&apos;s puzzle can be created.
      </p>
    </main>
  );
}
