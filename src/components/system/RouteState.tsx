import Link from "next/link";

export function RouteLoadingState() {
  return (
    <main className="page-backdrop flex flex-1" aria-busy="true">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <p role="status" className="label-dash text-action-text">
          Loading page…
        </p>
        <div aria-hidden="true" className="mt-5 animate-pulse space-y-6">
          <div className="h-12 w-64 max-w-full rounded bg-surface" />
          <div className="h-4 w-[34rem] max-w-full rounded bg-border-subtle/70" />
          <div className="grid gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="card-brand h-36 bg-surface/70" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

export function RouteErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="page-backdrop flex flex-1 items-center justify-center px-6 py-20 text-center">
      <section className="card-brand w-full max-w-xl p-8" role="alert">
        <span className="label-dash text-red-300">Something went wrong</span>
        <h1 className="type-display mt-3 text-3xl text-white">Couldn&apos;t load this page</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          The problem may be temporary. Try the request again, or return home and continue from there.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={onRetry} className="btn-primary px-4 py-2 text-xs">
            Try again
          </button>
          <Link href="/" className="btn-pill px-4 py-2 text-xs">
            Go home
          </Link>
        </div>
      </section>
    </main>
  );
}
