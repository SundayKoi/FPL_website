import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import AdminPatrons, { type PatronMember, type PatronReceipt } from "@/components/admin/AdminPatrons";

export const metadata: Metadata = {
  title: "Patrons — FPL Admin",
};

// The receipt book is service-role-only data; everything renders fresh.
export const dynamic = "force-dynamic";

/** The whole desk's data, off the render path — the purity lint is right
 *  that a component body shouldn't ask what time it is. */
async function loadPatronDesk(): Promise<{
  members: PatronMember[];
  receipts: PatronReceipt[];
  allTime: number;
  thisMonth: number;
}> {
  const service = createBettingServiceClient();
  const now = Date.now();

  const [profilesResult, receiptsResult] = await Promise.all([
    service
      .from("betting_profiles")
      .select("discord_id, username, patron_until")
      .order("username"),
    // The whole book, newest first. Patron payments arrive a handful a
    // month — if this ever nears the API's 1000-row cap, patronage has
    // long since paid for a proper paginated ledger page.
    service
      .from("patron_payments")
      .select("id, amount_usd, method, days_granted, paid_at, note, betting_profiles(username)")
      .order("paid_at", { ascending: false })
      .limit(500),
  ]);

  const members: PatronMember[] = (
    (profilesResult.data as { discord_id: string; username: string; patron_until: string | null }[]) ?? []
  ).map((row) => ({
    discordId: row.discord_id,
    username: row.username,
    patronUntil: row.patron_until,
    active: Boolean(row.patron_until && new Date(row.patron_until).getTime() > now),
  }));

  // A read error here almost always means the patron_payments migration
  // hasn't been applied — the page still renders, with an empty book.
  const receiptRows =
    (receiptsResult.data as unknown as {
      id: number;
      amount_usd: number;
      method: string;
      days_granted: number;
      paid_at: string;
      note: string | null;
      betting_profiles: { username: string } | null;
    }[]) ?? [];
  const receipts: PatronReceipt[] = receiptRows.map((row) => ({
    id: row.id,
    username: row.betting_profiles?.username ?? "—",
    amountUsd: Number(row.amount_usd),
    method: row.method,
    daysGranted: row.days_granted,
    paidAt: row.paid_at,
    note: row.note,
  }));

  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const allTime = receipts.reduce((sum, receipt) => sum + receipt.amountUsd, 0);
  const thisMonth = receipts
    .filter((receipt) => new Date(receipt.paidAt).getTime() >= monthStart.getTime())
    .reduce((sum, receipt) => sum + receipt.amountUsd, 0);

  return { members, receipts, allTime, thisMonth };
}

/**
 * The owner's patron desk. OWNER-gated, not admin: this page shows who
 * pays real money, and the grant action re-checks ownership server-side —
 * the redirect here is presentation, the action is the lock.
 */
export default async function AdminPatronsPage() {
  const supabase = await createServerSupabase();
  const { isOwner } = await fetchStaffTier(supabase);
  if (!isOwner) redirect("/admin");

  const { members, receipts, allTime, thisMonth } = await loadPatronDesk();

  return (
    <main className="bg-hash mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-16">
      <header>
        <span className="label-dash">OWNERS ONLY</span>
        <h1 className="type-display mt-3 text-4xl sm:text-5xl">Patrons</h1>
        <p className="mt-2 max-w-[60ch] text-sm text-steel">
          Venmo comes in, days go out. Recording a payment grants its days in the same transaction, so the receipt
          book and the flames can never disagree. Nothing here changes odds or ratings — patronage is visibility.
        </p>
      </header>
      <AdminPatrons members={members} receipts={receipts} allTime={allTime} thisMonth={thisMonth} />
    </main>
  );
}
