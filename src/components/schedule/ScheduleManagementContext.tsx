"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export type ScheduleManagementSection = "fixtures" | "season" | "rewards";

export interface ScheduleNavigationRequest {
  section: ScheduleManagementSection;
  panelId: string;
  fixtureId?: string | null;
}

export interface ScheduleManagementContextValue {
  isOpen: boolean;
  dirty: boolean;
  scopeMismatch: boolean;
  selectedFixtureId: string | null;
  resetRevision: number;
  requestNavigation: (request: ScheduleNavigationRequest) => void;
  requestClose: () => void;
  markDirty: (dirty?: boolean) => void;
  markClean: (resetForms?: boolean) => void;
  clearFixtureSelection: () => void;
}

const ScheduleManagementContext = createContext<ScheduleManagementContextValue | null>(null);

export function ScheduleManagementContextProvider({
  value,
  children,
}: {
  value: ScheduleManagementContextValue;
  children: ReactNode;
}) {
  return <ScheduleManagementContext.Provider value={value}>{children}</ScheduleManagementContext.Provider>;
}

export function useScheduleManagement(): ScheduleManagementContextValue | null {
  return useContext(ScheduleManagementContext);
}
