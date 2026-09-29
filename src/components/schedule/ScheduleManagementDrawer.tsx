"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import styles from "./ScheduleManagementDrawer.module.css";
import {
  ScheduleManagementContextProvider,
  type ScheduleManagementSection,
  type ScheduleManagementContextValue,
  type ScheduleNavigationRequest,
} from "./ScheduleManagementContext";

export interface ScheduleManagementPanel {
  id: string;
  label: string;
  content: ReactNode;
}

export type ScheduleManagementPanels = Record<ScheduleManagementSection, ScheduleManagementPanel[]>;

type PendingAction = ({ type: "navigate" } & ScheduleNavigationRequest) | { type: "close" } | { type: "scope-reset" };

function firstPanel(panels: ScheduleManagementPanels, section: ScheduleManagementSection): string {
  return panels[section][0]?.id ?? "browse";
}

export default function ScheduleManagementDrawer({
  children,
  panels,
  scope,
  scopeLabel,
  initialSelectedFixtureId = null,
}: {
  children: ReactNode;
  panels: ScheduleManagementPanels;
  scope: string;
  scopeLabel: string;
  initialSelectedFixtureId?: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<ScheduleManagementSection>("fixtures");
  const [panelId, setPanelId] = useState(firstPanel(panels, "fixtures"));
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(initialSelectedFixtureId);
  const [dirty, setDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [trackedScope, setTrackedScope] = useState(scope);
  const [dismissedScope, setDismissedScope] = useState<string | null>(null);
  const [resetRevision, setResetRevision] = useState(0);

  const sections = useMemo(
    () => (["fixtures", "season", "rewards"] as const).filter((key) => panels[key].length > 0),
    [panels],
  );
  const scopeChanged = trackedScope !== scope;
  if (scopeChanged && !dirty) {
    // A clean route change invalidates the previous drawer state. Reset during
    // render so returning to an earlier season cannot reopen a stale selection.
    setTrackedScope(scope);
    setOpen(false);
    setSection("fixtures");
    setPanelId(firstPanel(panels, "fixtures"));
    setSelectedFixtureId(null);
    setPendingAction(null);
    setDismissedScope(null);
  }
  const scopeMismatch = scopeChanged && dirty;
  const visibleOpen = open && (!scopeChanged || dirty);
  const visibleSelectedFixtureId = scopeChanged && !dirty ? null : selectedFixtureId;
  const activePanels = panels[section];
  const activePanel = activePanels.find((panel) => panel.id === panelId) ?? activePanels[0];

  function applyNavigation(request: PendingAction) {
    setTrackedScope(scope);
    setDismissedScope(null);
    if (request.type === "close") {
      setOpen(false);
      setSelectedFixtureId(null);
      setPanelId(firstPanel(panels, "fixtures"));
      return;
    }
    if (request.type === "scope-reset") {
      setOpen(false);
      setSection("fixtures");
      setPanelId(firstPanel(panels, "fixtures"));
      setSelectedFixtureId(null);
      return;
    }
    setOpen(true);
    setSection(request.section);
    setPanelId(request.panelId);
    setSelectedFixtureId(request.fixtureId ?? null);
  }

  function requestNavigation(request: ScheduleNavigationRequest) {
    if (dirty) {
      setPendingAction({ type: "navigate", ...request });
      return;
    }
    applyNavigation({ type: "navigate", ...request });
  }

  function requestClose() {
    if (dirty) {
      setPendingAction({ type: "close" });
      return;
    }
    applyNavigation({ type: "close" });
  }

  function markDirty(next = true) {
    setDirty(next);
  }

  function markClean(resetForms = false) {
    setDirty(false);
    if (resetForms) setResetRevision((revision) => revision + 1);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (visibleOpen && !dialog.open) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      dialog.showModal();
      headingRef.current?.focus();
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
    if (!visibleOpen && dialog.open) {
      dialog.close();
      window.setTimeout(() => openerRef.current?.focus(), 0);
    }
  }, [visibleOpen]);

  const contextValue: ScheduleManagementContextValue = {
    isOpen: visibleOpen,
    dirty,
    scopeMismatch,
    selectedFixtureId: visibleSelectedFixtureId,
    resetRevision,
    requestNavigation,
    requestClose,
    markDirty,
    markClean,
    clearFixtureSelection: () => setSelectedFixtureId(null),
  };

  return (
    <ScheduleManagementContextProvider value={contextValue}>
      {children}
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="schedule-management-heading"
        onCancel={(event) => {
          event.preventDefault();
          requestClose();
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) requestClose();
        }}
      >
        <div className={styles.shell}>
          <header className={styles.header}>
            <div>
              <p className="label-dash">Premier schedule</p>
              <h2 id="schedule-management-heading" ref={headingRef} tabIndex={-1} className="type-display mt-1 text-2xl">
                Manage schedule
              </h2>
              <p className="mt-1 text-sm text-muted">{scopeLabel}</p>
            </div>
            <button type="button" className={styles.close} onClick={requestClose} aria-label="Close schedule management">
              ×
            </button>
          </header>

          <nav className={styles.tabs} aria-label="Schedule management area">
            {sections.map((key) => (
              <button
                key={key}
                type="button"
                aria-current={section === key ? "page" : undefined}
                className={`${styles.tab} ${section === key ? styles.activeTab : ""}`}
                onClick={() => requestNavigation({ section: key, panelId: firstPanel(panels, key) })}
              >
                {key === "fixtures" ? "Fixtures" : key === "season" ? "Season" : "Rewards"}
              </button>
            ))}
          </nav>

          {scopeMismatch ? (
            <p role="status" className={styles.warning}>
              The viewed league or season changed. Saving is paused while this edit is open.
            </p>
          ) : null}

          {activePanels.length > 1 ? (
            <div className={styles.toolPicker}>
              <label className="label-dash" htmlFor="schedule-management-tool">Tool</label>
              <select
                id="schedule-management-tool"
                value={activePanel?.id ?? ""}
                onChange={(event) => requestNavigation({ section, panelId: event.target.value })}
              >
                {activePanels.map((panel) => <option key={panel.id} value={panel.id}>{panel.label}</option>)}
              </select>
            </div>
          ) : null}

          <div
            className={styles.body}
            onChangeCapture={() => markDirty(true)}
            onInputCapture={() => markDirty(true)}
          >
            {activePanel?.content ?? <p className="text-sm text-muted">No tools are available in this area.</p>}
          </div>

          {(pendingAction || (scopeMismatch && dismissedScope !== scope ? { type: "scope-reset" as const } : null)) ? (
            <div className={styles.confirm} role="alertdialog" aria-labelledby="discard-heading" aria-describedby="discard-description">
              <h3 id="discard-heading" className="font-semibold text-white">Discard unsaved changes?</h3>
              <p id="discard-description" className="mt-1 text-sm text-muted">Your current edits have not been saved.</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded-full border border-border-strong px-3 py-1.5 text-sm" onClick={() => { setPendingAction(null); window.requestAnimationFrame(() => headingRef.current?.focus()); }}>
                  Keep editing
                </button>
                <button
                  type="button"
                  className="rounded-full bg-action-fill px-3 py-1.5 text-sm font-semibold text-white"
                  onClick={() => {
                    const request = pendingAction ?? { type: "scope-reset" as const };
                    setDirty(false);
                    setResetRevision((revision) => revision + 1);
                    setPendingAction(null);
                    applyNavigation(request);
                  }}
                >
                  Discard changes
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </dialog>
    </ScheduleManagementContextProvider>
  );
}
