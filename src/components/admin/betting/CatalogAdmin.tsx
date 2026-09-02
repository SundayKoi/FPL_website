"use client";
import { useState } from "react";
import type { BettingEvent, BettingEventLeague, BettingTeam } from "@/lib/betting/types";
import { fmtPoints } from "@/lib/betting/format";
import {
  upsertTeam,
  deleteTeam,
  upsertEvent,
  deleteEvent,
  upsertStoreItem,
  deleteStoreItem,
} from "@/lib/betting/admin-actions";
import { ErrorBanner, useAdminRun } from "./useAdminRun";
import type { Runner } from "./useAdminRun";

export interface StoreItemRow {
  id: number;
  name: string;
  description: string | null;
  cost: number;
  type: string;
  active: boolean;
}

function TeamsSection({ teams, busy, run }: { teams: BettingTeam[]; busy: boolean; run: Runner }) {
  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [color, setColor] = useState("#888780");

  return (
    <section className="flex flex-col gap-3">
      <h2 className="label-dash">Teams</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !shortCode.trim()) return;
          run(
            () => upsertTeam({ name, shortCode, color }),
            () => {
              setName("");
              setShortCode("");
            },
          );
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col gap-1 text-xs text-muted">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-brand px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Short code
          <input
            value={shortCode}
            onChange={(e) => setShortCode(e.target.value)}
            maxLength={8}
            className="w-24 input-brand px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Color
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 rounded border border-border-subtle bg-canvas" />
        </label>
        <button
          type="submit"
          disabled={busy || !name.trim() || !shortCode.trim()}
          className="btn-primary px-3 py-1.5 text-xs"
        >
          Add team
        </button>
      </form>
      <ul className="flex flex-col gap-1.5">
        {teams.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 rounded border border-border-subtle bg-surface px-3 py-1.5 text-sm">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
              <span className="font-medium text-white">{t.name}</span>
              <span className="text-xs text-muted">{t.short_code}</span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm(`Delete team "${t.name}"? Only possible if no market references it.`)) {
                  run(() => deleteTeam(t.id));
                }
              }}
              className="rounded border border-red-500/60 px-2 py-0.5 text-xs font-semibold text-red-400 disabled:opacity-40"
            >
              Delete
            </button>
          </li>
        ))}
        {teams.length === 0 && <p className="text-sm text-muted">No teams yet.</p>}
      </ul>
    </section>
  );
}

function EventsSection({
  events,
  busy,
  run,
}: {
  events: BettingEvent[];
  busy: boolean;
  run: Runner;
}) {
  const [name, setName] = useState("");
  const [league, setLeague] = useState<"" | BettingEventLeague>("");
  const [scheduleSeason, setScheduleSeason] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingLeague, setEditingLeague] = useState<"" | BettingEventLeague>("");
  const [editingSeason, setEditingSeason] = useState("");

  return (
    <section className="flex flex-col gap-3">
      <h2 className="label-dash">Events</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          run(() => upsertEvent({
            name,
            league: league || null,
            scheduleSeason: league ? scheduleSeason : null,
          }), () => {
            setName("");
            setLeague("");
            setScheduleSeason("");
          });
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col gap-1 text-xs text-muted">
          Event name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-brand px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Schedule league
          <select
            aria-label="Schedule league"
            value={league}
            onChange={(e) => setLeague(e.target.value as "" | BettingEventLeague)}
            className="input-brand px-2 py-1.5 text-sm"
          >
            <option value="">Not schedule-linked</option>
            <option value="premier">Premier</option>
            <option value="academy">Academy</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Schedule season
          <input
            aria-label="Schedule season"
            value={scheduleSeason}
            onChange={(e) => setScheduleSeason(e.target.value)}
            disabled={!league}
            placeholder="e.g. S5 or A1"
            className="w-28 input-brand px-2 py-1.5 text-sm disabled:opacity-40"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !name.trim() || (!!league && !scheduleSeason.trim())}
          className="btn-primary px-3 py-1.5 text-xs"
        >
          Add event
        </button>
      </form>
      <ul className="flex flex-col gap-1.5">
        {events.map((ev) => (
          <li key={ev.id} className="flex items-center justify-between gap-2 rounded border border-border-subtle bg-surface px-3 py-1.5 text-sm">
            <div className="flex flex-col gap-1">
              <span className="font-medium text-white">{ev.name}</span>
              {editingId === ev.id ? (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Schedule league
                    <select
                      aria-label={`Schedule league for ${ev.name}`}
                      value={editingLeague}
                      onChange={(e) => setEditingLeague(e.target.value as "" | BettingEventLeague)}
                      className="input-brand px-2 py-1 text-xs"
                    >
                      <option value="">Not schedule-linked</option>
                      <option value="premier">Premier</option>
                      <option value="academy">Academy</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Schedule season
                    <input
                      aria-label={`Schedule season for ${ev.name}`}
                      value={editingSeason}
                      onChange={(e) => setEditingSeason(e.target.value)}
                      disabled={!editingLeague}
                      className="w-24 input-brand px-2 py-1 text-xs disabled:opacity-40"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy || (!!editingLeague && !editingSeason.trim())}
                    onClick={() => run(() => upsertEvent({
                      id: ev.id,
                      name: ev.name,
                      league: editingLeague || null,
                      scheduleSeason: editingLeague ? editingSeason : null,
                    }), () => setEditingId(null))}
                    className="btn-primary px-2 py-1 text-xs disabled:opacity-40"
                  >
                    Save schedule binding
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setEditingId(null)}
                    className="rounded border border-border-subtle px-2 py-1 text-xs text-muted"
                  >
                    Cancel binding edit
                  </button>
                </div>
              ) : (
                <span className="text-xs text-muted">
                  {ev.league && ev.schedule_season
                    ? `${ev.league === "premier" ? "Premier" : "Academy"} · ${ev.schedule_season}`
                    : "Not linked to the schedule"}
                </span>
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditingId(ev.id);
                setEditingLeague(ev.league ?? "");
                setEditingSeason(ev.schedule_season ?? "");
              }}
              className="rounded border border-border-strong px-2 py-0.5 text-xs text-muted hover:border-action-text hover:text-action-text disabled:opacity-40"
            >
              Edit schedule binding
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm(`Delete event "${ev.name}"? Only possible if it has no markets.`)) {
                  run(() => deleteEvent(ev.id));
                }
              }}
              className="rounded border border-red-500/60 px-2 py-0.5 text-xs font-semibold text-red-400 disabled:opacity-40"
            >
              Delete
            </button>
          </li>
        ))}
        {events.length === 0 && <p className="text-sm text-muted">No events yet.</p>}
      </ul>
    </section>
  );
}

function StoreSection({ items, busy, run }: { items: StoreItemRow[]; busy: boolean; run: Runner }) {
  const [name, setName] = useState("");
  const [cost, setCost] = useState(500);
  const [type, setType] = useState("role");

  return (
    <section className="flex flex-col gap-3">
      <h2 className="label-dash">Store</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !type.trim() || cost <= 0) return;
          run(
            () => upsertStoreItem({ name, cost, type, active: true }),
            () => setName(""),
          );
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col gap-1 text-xs text-muted">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-brand px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Cost
          <input
            type="number"
            min={1}
            value={cost}
            onChange={(e) => setCost(Math.max(1, Number(e.target.value) || 0))}
            className="w-24 input-brand px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Type
          <input
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-24 input-brand px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !name.trim() || !type.trim() || cost <= 0}
          className="btn-primary px-3 py-1.5 text-xs"
        >
          Add item
        </button>
      </form>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 rounded border border-border-subtle bg-surface px-3 py-1.5 text-sm">
            <span className="flex items-center gap-2">
              <span className="font-medium text-white">{item.name}</span>
              <span className="text-xs text-muted">
                {fmtPoints(item.cost)} · {item.type} · {item.active ? "active" : "inactive"}
              </span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() => upsertStoreItem({ id: item.id, name: item.name, cost: item.cost, type: item.type, active: !item.active }))
                }
                className="rounded border border-border-strong px-2 py-0.5 text-xs text-muted hover:border-action-text hover:text-action-text disabled:opacity-40"
              >
                {item.active ? "Deactivate" : "Activate"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Delete "${item.name}"? Only possible if it was never purchased.`)) {
                    run(() => deleteStoreItem(item.id));
                  }
                }}
                className="rounded border border-red-500/60 px-2 py-0.5 text-xs font-semibold text-red-400 disabled:opacity-40"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
        {items.length === 0 && <p className="text-sm text-muted">No store items yet.</p>}
      </ul>
    </section>
  );
}

export default function CatalogAdmin({
  teams,
  events,
  storeItems,
}: {
  teams: BettingTeam[];
  events: BettingEvent[];
  storeItems: StoreItemRow[];
}) {
  const { error, pending, run } = useAdminRun();

  return (
    <div className="flex flex-col gap-8">
      <ErrorBanner error={error} />
      <TeamsSection teams={teams} busy={pending} run={run} />
      <EventsSection events={events} busy={pending} run={run} />
      <StoreSection items={storeItems} busy={pending} run={run} />
    </div>
  );
}
