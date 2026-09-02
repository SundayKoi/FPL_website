"use client";
import { useState } from "react";
import { StatusPill } from "@/components/betting/StatusPill";
import { fmtPoints } from "@/lib/betting/format";
import type { MarketStatus } from "@/lib/betting/types";
import { createPickem, resolvePickem, cancelPickem } from "@/lib/betting/admin-actions";
import { ErrorBanner, useAdminRun } from "./useAdminRun";

export interface AdminPickemRow {
  id: number;
  title: string;
  status: MarketStatus;
  carryover: number;
  lock_at: string;
  pool: number;
  legCount: number;
  legLabels: string[];
  /** true once every leg market is RESOLVED/CANCELLED — resolve_pickem will
   * otherwise raise "pick-em has unresolved series". */
  readyToResolve: boolean;
}

export interface LegOption {
  id: number;
  label: string;
}

function CreatePickemForm({
  events,
  legOptions,
  busy,
  onCreate,
}: {
  events: { id: number; name: string }[];
  legOptions: LegOption[];
  busy: boolean;
  onCreate: (input: { eventId: number; title: string; marketIds: number[] }) => void;
}) {
  const [eventId, setEventId] = useState(events[0]?.id ?? 0);
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<number[]>([]);

  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const canSubmit = eventId && title.trim() && selected.length >= 2;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onCreate({ eventId, title: title.trim(), marketIds: selected });
      }}
      className="card-brand flex flex-col gap-3 p-4"
    >
      <h2 className="label-dash">New pick&apos;em</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Event
          <select
            value={eventId}
            onChange={(e) => setEventId(Number(e.target.value))}
            className="input-brand px-2 py-1.5 text-sm"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Night 1"
            className="input-brand px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">Series (pick at least 2 OPEN, non-draw markets)</span>
        {legOptions.length === 0 ? (
          <p className="text-xs text-muted">No eligible markets — create one on the Markets page first.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {legOptions.map((leg) => (
              <label
                key={leg.id}
                className={
                  "cursor-pointer rounded border px-2 py-1 text-xs " +
                  (selected.includes(leg.id) ? "border-action-text bg-action-fill/10 text-action-text" : "border-border-subtle text-muted")
                }
              >
                <input type="checkbox" className="mr-1" checked={selected.includes(leg.id)} onChange={() => toggle(leg.id)} />
                {leg.label}
              </label>
            ))}
          </div>
        )}
      </div>
      <button
        type="submit"
        disabled={!canSubmit || busy}
        className="self-start btn-primary px-4 py-2 text-sm"
      >
        Create pick&apos;em
      </button>
    </form>
  );
}

export default function PickemsAdmin({
  pickems,
  events,
  legOptions,
  bank,
}: {
  pickems: AdminPickemRow[];
  events: { id: number; name: string }[];
  legOptions: LegOption[];
  bank: number;
}) {
  const { error, pending, run } = useAdminRun();

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-muted">
        Jackpot bank: <span className="font-semibold text-gold">{fmtPoints(bank)}</span>
      </div>
      <ErrorBanner error={error} />

      <CreatePickemForm
        events={events}
        legOptions={legOptions}
        busy={pending}
        onCreate={(input) => run(() => createPickem(input))}
      />

      <div className="flex flex-col gap-2">
        <h2 className="label-dash">Pick&apos;ems ({pickems.length})</h2>
        {pickems.length === 0 ? (
          <p className="text-sm text-muted">No pick&apos;ems yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pickems.map((p) => (
              <li key={p.id} className="card-brand flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={p.status} />
                    <span className="truncate font-medium text-white">{p.title}</span>
                  </div>
                  <div className="text-xs text-muted">
                    {p.legCount} legs · Pool {fmtPoints(p.pool)} · {p.legLabels.join(", ")}
                  </div>
                </div>
                {(p.status === "OPEN" || p.status === "LOCKED") && (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={pending || !p.readyToResolve}
                      title={p.readyToResolve ? undefined : "Resolve/cancel every leg market first"}
                      onClick={() => {
                        if (confirm(`Resolve "${p.title}"? This pays out cards immediately.`)) {
                          run(() => resolvePickem(p.id));
                        }
                      }}
                      className="rounded border border-mint/60 px-2 py-1 text-xs font-semibold text-mint disabled:opacity-40"
                    >
                      Resolve
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (confirm(`Cancel "${p.title}"? Every card is refunded and the carryover returns to the bank.`)) {
                          run(() => cancelPickem(p.id));
                        }
                      }}
                      className="rounded border border-border-subtle px-2 py-1 text-xs text-muted hover:border-red-400 hover:text-red-300 disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
