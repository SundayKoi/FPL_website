import type { LiveConnectionStatus } from "@/lib/realtime/connection";

export default function ConnectionBanner({
  status,
  onRetry,
}: {
  status: LiveConnectionStatus;
  onRetry: () => void;
}) {
  if (status === "connected") return null;

  if (status === "connecting") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded border border-border bg-surface px-3 py-2 text-center text-xs text-muted"
      >
        Connecting to live updates…
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-center text-xs text-red-300"
    >
      <span>Live updates interrupted. The page may be stale while we reconnect.</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full border border-red-400/60 px-3 py-1 font-semibold uppercase tracking-wide text-red-200 transition hover:bg-red-500/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Retry now
      </button>
    </div>
  );
}
