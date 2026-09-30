"use client";

import { useState } from "react";
import { createEventAction, updateEventAction } from "@/lib/offseason/actions";
import { STATUS_LABELS, type OffseasonEvent, type OffseasonEventStatus } from "@/lib/offseason/types";
import { ActionMessage, inputClass, labelClass, primaryButtonClass, useOffseasonAction } from "./shared";

export function CreateEventForm() {
  const [name, setName] = useState("FPL Offseason Tournament");
  const { pending, message, run } = useOffseasonAction();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => createEventAction(name), "Event created.");
      }}
    >
      <label className={labelClass}>
        Event name
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} w-72`} />
      </label>
      <button type="submit" disabled={pending || !name.trim()} className={primaryButtonClass}>
        Create event
      </button>
      <ActionMessage message={message} />
    </form>
  );
}

export default function EventSettings({ event }: { event: OffseasonEvent }) {
  const [name, setName] = useState(event.name);
  const [status, setStatus] = useState<OffseasonEventStatus>(event.status);
  const [signupsOpen, setSignupsOpen] = useState(event.signups_open);
  const [yardstick, setYardstick] = useState(event.yardstick_season);
  const { pending, message, run } = useOffseasonAction();
  const dirty =
    name !== event.name || status !== event.status || signupsOpen !== event.signups_open || yardstick !== event.yardstick_season;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => updateEventAction(event.id, { name: name.trim(), status, signups_open: signupsOpen, yardstick_season: yardstick.trim().toUpperCase() }),
          "Event saved.",
        );
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} w-64`} />
        </label>
        <label className={labelClass}>
          Stage
          <select value={status} onChange={(e) => setStatus(e.target.value as OffseasonEventStatus)} className={inputClass}>
            {(Object.keys(STATUS_LABELS) as OffseasonEventStatus[]).map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Rating yardstick
          <input value={yardstick} onChange={(e) => setYardstick(e.target.value)} className={`${inputClass} w-20`} />
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-sm text-content">
          <input type="checkbox" checked={signupsOpen} onChange={(e) => setSignupsOpen(e.target.checked)} />
          Sign-ups open
        </label>
        <button type="submit" disabled={pending || !dirty} className={primaryButtonClass}>
          Save
        </button>
      </div>
      <ActionMessage message={message} />
    </form>
  );
}
