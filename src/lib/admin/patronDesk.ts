import "server-only";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import type { PatronMember, PatronReceipt } from "@/components/admin/AdminPatrons";

export async function loadAdminPatronDesk(): Promise<{
  members: PatronMember[];
  receipts: PatronReceipt[];
  allTime: number;
  thisMonth: number;
}> {
  const service = createBettingServiceClient();
  const now = Date.now();
  const [profilesResult, receiptsResult] = await Promise.all([
    service.from("betting_profiles").select("discord_id, username, patron_until").order("username"),
    service
      .from("patron_payments")
      .select("id, amount_usd, method, days_granted, paid_at, note, betting_profiles(username)")
      .order("paid_at", { ascending: false })
      .limit(500),
  ]);
  const members: PatronMember[] = (
    (profilesResult.data as { discord_id: string; username: string; patron_until: string | null }[] | null) ?? []
  ).map((row) => ({
    discordId: row.discord_id,
    username: row.username,
    patronUntil: row.patron_until,
    active: Boolean(row.patron_until && Date.parse(row.patron_until) > now),
  }));
  const receiptRows = (receiptsResult.data as unknown as {
    id: number;
    amount_usd: number;
    method: string;
    days_granted: number;
    paid_at: string;
    note: string | null;
    betting_profiles: { username: string } | null;
  }[] | null) ?? [];
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
    .filter((receipt) => Date.parse(receipt.paidAt) >= monthStart.getTime())
    .reduce((sum, receipt) => sum + receipt.amountUsd, 0);
  return { members, receipts, allTime, thisMonth };
}
