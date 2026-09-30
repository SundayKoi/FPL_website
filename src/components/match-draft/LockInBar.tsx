import type { MatchDraftChampion } from "@/lib/match-draft/champions";
import type { DraftStep } from "@/lib/match-draft/types";

/** Pops up where the action is: pinned to the bottom of the viewport the
 *  moment a champion is selected, so confirming never means scrolling back
 *  to the header. */
export function LockInBar({
  champion,
  resolve,
  currentStep,
  saving,
  onCancel,
  onLockIn,
}: {
  /** The viewer's selected (not yet locked) champion. */
  champion: string;
  resolve: (name: string) => MatchDraftChampion | null;
  currentStep: DraftStep | undefined;
  saving: boolean;
  onCancel: () => void;
  onLockIn: () => void;
}) {
  const pendingChampion = resolve(champion);
  return (
    <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4" role="dialog" aria-label="Confirm pick">
      <div className="flex items-center gap-3 rounded-full border border-coral/60 bg-canvas/95 py-2 pl-2 pr-2 shadow-[0_8px_32px_rgb(0_0_0/0.6)] backdrop-blur">
        {pendingChampion ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pendingChampion.iconUrl} alt="" className="h-10 w-10 rounded-full border border-border-subtle object-cover" />
        ) : null}
        <div className="min-w-0">
          <p className="font-display text-sm font-bold not-italic text-white">{champion}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted">
            {currentStep?.side} {currentStep?.kind} {currentStep?.slot}
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="rounded-full border border-border-subtle px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted transition hover:text-white disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onLockIn}
          className="btn-primary px-4 py-1.5 text-xs disabled:opacity-40"
        >
          Lock in {champion}
        </button>
      </div>
    </div>
  );
}
