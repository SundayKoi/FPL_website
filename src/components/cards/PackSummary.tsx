// The pack opening's summary bar: what the pack was worth, what the session
// has come to, the dust buttons, and the door back to another pack.
// Rendered only by PackOpening, a client component, so it carries no
// directive of its own. It holds no state: every number and every handler
// belongs to the stage.

import { fmtPoints } from "@/lib/betting/format";
import { GOD_PACK_ODDS_DENOMINATOR } from "@/lib/packs/config";
import type { AutoDusted, Pull } from "./packOpeningModel";

export default function PackSummary({
  godPack,
  packValue,
  dustTotal,
  newCount,
  count,
  balance,
  sessionCount,
  bestPull,
  summaryNote,
  error,
  sellError,
  auto,
  autoDustProtected,
  sold,
  showSell,
  pickedCount,
  pickedTotal,
  remainingCount,
  remainingTotal,
  armedSell,
  selling,
  pending,
  preview,
  packCost,
  onSell,
  onOpenAnother,
  onExit,
}: {
  godPack: boolean;
  /** Null hides the figure; undefined falls back to the dust total. */
  packValue?: number | null;
  dustTotal: number;
  newCount: number;
  count: number;
  balance: number;
  sessionCount: number;
  bestPull: Pull | null;
  summaryNote?: string;
  error: string | null;
  sellError: string | null;
  auto: AutoDusted | null;
  autoDustProtected: boolean;
  sold: { dusted: number; value: number } | null;
  /** The dust buttons: a sellable stage with something left to dust. */
  showSell: boolean;
  pickedCount: number;
  pickedTotal: number;
  remainingCount: number;
  remainingTotal: number;
  armedSell: "all" | "picked" | null;
  selling: boolean;
  pending: boolean;
  preview: boolean;
  packCost: number;
  onSell: (mode: "all" | "picked") => Promise<void>;
  onOpenAnother: () => Promise<void>;
  onExit: () => void;
}) {
  return (
    <div className="pack-summary flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
      {godPack ? (
        <div className="god-pack-summary-badge" role="status">
          <span className="label-dash">GOD PACK · 1 IN {GOD_PACK_ODDS_DENOMINATOR}</span>
          <span className="text-sm font-semibold text-white">Five guaranteed special foils</span>
        </div>
      ) : null}
      {packValue !== null ? (
        <div className="flex flex-col">
          <span className="label-dash">Pack value</span>
          <span className="text-lg font-bold text-gold">{fmtPoints(packValue === undefined ? dustTotal : packValue)}</span>
        </div>
      ) : null}
      <div className="flex flex-col">
        <span className="label-dash">New cards</span>
        <span className="text-lg font-bold text-white">
          {newCount} of {count}
        </span>
      </div>
      <div className="flex flex-col">
        <span className="label-dash">Balance</span>
        <span className="text-lg font-bold text-white">{fmtPoints(balance)}</span>
      </div>
      <div className="flex flex-col">
        <span className="label-dash">This session</span>
        <span className="text-lg font-bold text-white">
          {sessionCount} {sessionCount === 1 ? "pack" : "packs"}
        </span>
      </div>
      {bestPull ? (
        <span className="rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-gold">
          ★ Best pull · {bestPull.card?.name ?? bestPull.displayName ?? "Collectible"}
        </span>
      ) : null}
      {summaryNote ? <span className="rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">{summaryNote}</span> : null}

      <div className="ml-auto flex flex-wrap items-center gap-3">
        {error ? (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        ) : null}
        {sellError ? (
          <p role="alert" className="text-sm text-red-400">
            {sellError}
          </p>
        ) : null}
        {auto ? (
          <span
            className="rounded-full border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-muted"
            title="Your auto-dust rule took these as the pack opened. Change it from your collection."
          >
            Auto-dusted {auto.dusted} for +{fmtPoints(auto.value)}
          </span>
        ) : null}
        {autoDustProtected ? (
          <span className="rounded-full border border-gold/60 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold">
            God Pack pulls protected from auto-dust
          </span>
        ) : null}
        {sold ? (
          <span className="rounded-full border border-gold/50 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold">
            Dusted {sold.dusted} for +{fmtPoints(sold.value)}
          </span>
        ) : null}
        {showSell ? (
          <>
            {pickedCount > 0 ? (
              <button
                type="button"
                onClick={() => void onSell("picked")}
                disabled={selling || pending}
                className="rounded-full border border-gold/60 bg-gold/10 px-5 py-2.5 text-sm font-semibold text-gold transition hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {selling
                  ? "Dusting…"
                  : armedSell === "picked"
                    ? `Dust ${pickedCount} — sure?`
                    : `Dust ${pickedCount} selected — +${fmtPoints(pickedTotal)}`}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void onSell("all")}
              disabled={selling || pending}
              className="rounded-full border border-border-subtle px-5 py-2.5 text-sm font-semibold text-muted transition hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {selling
                ? "Dusting…"
                : armedSell === "all"
                  ? `Dust all ${remainingCount} — sure?`
                  : `Dust all — +${fmtPoints(remainingTotal)}`}
            </button>
          </>
        ) : null}
        {!preview ? (
          <button
            type="button"
            onClick={onOpenAnother}
            disabled={pending || error !== null || selling}
            className="btn-primary px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Opening…" : `Open another — ${fmtPoints(packCost)}`}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onExit}
          className="rounded-full border border-border-strong px-5 py-2.5 text-sm font-semibold text-muted transition-colors hover:border-action-text hover:text-white"
        >
          Done
        </button>
      </div>
    </div>
  );
}
