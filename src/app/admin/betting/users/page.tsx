import { redirect } from "next/navigation";
import { requireBettingStaff } from "@/lib/betting/access";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import UsersAdmin, { type AuditRow, type BalanceRow } from "@/components/admin/betting/UsersAdmin";

/**
 * Audit trail: betting_admin_audit has no public RLS read policy (see
 * 20260813000001_betting_schema.sql's RLS block) — only reachable through
 * this service-client read inside a staff-gated server component, per this
 * task's brief.
 */
export default async function AdminBettingUsersPage() {
  try {
    await requireBettingStaff();
  } catch {
    redirect("/");
  }

  const service = createBettingServiceClient();
  const [balancesRes, auditRes] = await Promise.all([
    service.from("betting_profiles").select("discord_id, username, avatar_url, balance").order("balance", { ascending: false }).limit(100),
    service.from("betting_admin_audit").select("id, actor, action, target, created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  const balances = (balancesRes.data as BalanceRow[] | null) ?? [];
  const audit = (auditRes.data as AuditRow[] | null) ?? [];

  return (
    <main className="bg-hash mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-16">
      <header>
        <span className="label-dash">STAFF ONLY</span>
        <h1 className="type-display mt-3 text-4xl sm:text-5xl">Betting — Users</h1>
      </header>
      <UsersAdmin balances={balances} audit={audit} />
    </main>
  );
}
