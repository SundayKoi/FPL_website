import type { ReactNode } from "react";
import AdminNavigation from "@/components/admin/AdminNavigation";
import AdminLegacyHashBridge from "@/components/admin/AdminLegacyHashBridge";
import styles from "@/components/admin/AdminWorkspace.module.css";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createServerSupabase } from "@/lib/supabase/server";

/** Persistent workspace chrome; each page and action keeps its own authority check. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const tier = await fetchStaffTier(await createServerSupabase());
  const isStaff = tier.isAdmin || tier.isOwner || tier.isBroadcaster;
  return (
    <div className={styles.layout} data-admin-workspace data-admin-limited={!isStaff}>
      <AdminLegacyHashBridge />
      <AdminNavigation
        isAdmin={tier.isAdmin}
        isOwner={tier.isOwner}
        isBroadcaster={tier.isBroadcaster}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
