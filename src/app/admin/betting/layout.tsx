import type { ReactNode } from "react";
import AdminBettingTabs from "@/components/admin/betting/AdminBettingTabs";

/** Shared chrome for the betting admin: a tab bar so staff click between
 * sections instead of remembering URLs. Authorization stays in each page
 * (they all call requireBettingStaff) — this layout is presentation only. */
export default function AdminBettingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <AdminBettingTabs />
      <div className="flex-1">{children}</div>
    </div>
  );
}
