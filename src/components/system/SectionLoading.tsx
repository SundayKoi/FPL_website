/**
 * The skeleton a section shows while its page loads, INSIDE that section's
 * chrome. The root loading state replaces the whole viewport; put one of
 * these in a layout's own loading.tsx and the tab bar or sub-nav above it
 * stays where it was, so a move from Market to Trades looks like a move,
 * not a reload.
 */
export default function SectionLoading({ label = "Loading…", rows = 4 }: { label?: string; rows?: number }) {
  return (
    <main className="page-backdrop flex flex-1" aria-busy="true">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-8 sm:px-6 sm:py-10">
        <p role="status" className="label-dash text-action-text">
          {label}
        </p>
        <div aria-hidden="true" className="mt-4 animate-pulse space-y-4">
          <div className="h-9 w-72 max-w-full rounded bg-surface" />
          <div className="h-4 w-[30rem] max-w-full rounded bg-border-subtle/70" />
          <div className="grid gap-4 pt-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: rows }, (_, index) => (
              <div key={index} className="card-brand h-32 bg-surface/70" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
