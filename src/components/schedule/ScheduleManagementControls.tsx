"use client";

import { useScheduleManagement } from "./ScheduleManagementContext";

export function ScheduleManageButton() {
  const management = useScheduleManagement();
  if (!management) return null;
  return (
    <button
      type="button"
      onClick={() => management.requestNavigation({ section: "fixtures", panelId: "browse" })}
      className="inline-flex min-h-10 items-center gap-2 rounded-md bg-action-fill px-4 text-sm font-semibold text-white hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <span aria-hidden="true">⚙</span> Manage
    </button>
  );
}

export function ScheduleFixtureEditButton({ fixtureId, fixtureLabel }: { fixtureId: string; fixtureLabel: string }) {
  const management = useScheduleManagement();
  if (!management) return null;
  return (
    <button
      type="button"
      onClick={() => management.requestNavigation({ section: "fixtures", panelId: "browse", fixtureId })}
      aria-label={`Edit ${fixtureLabel}`}
      className="rounded border border-border-subtle px-2 py-1 text-xs font-semibold text-muted hover:border-action-text hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      Edit
    </button>
  );
}
