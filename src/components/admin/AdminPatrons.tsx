"use client";

// The owner's patron desk: record a Venmo payment and grant its days in
// one click, see who's burning and until when, and read the receipt book.
// All writes go through owner-gated server actions; this is presentation
// and two-tap safety only.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminInputClass } from "@/components/matches/CollapsibleAdminSection";
import { grantPatronAction, revokePatronAction } from "@/lib/patron/admin-actions";

export interface PatronMember {
  discordId: string;
  username: string;
  patronUntil: string | null;
  /** Computed server-side — the client never asks what time it is. */
  active: boolean;
}

export interface PatronReceipt {
  id: number;
  username: string;
  amountUsd: number;
  method: string;
  daysGranted: number;
  paidAt: string;
  note: string | null;
}

/** "2026-09-25T…" -> "Sep 25, 2026". Fixed locale + UTC so server and
 *  client render the same string. */
function dateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default function AdminPatrons({
  members,
  receipts,
  allTime,
  thisMonth,
}: {
  members: PatronMember[];
  receipts: PatronReceipt[];
  allTime: number;
  thisMonth: number;
}) {
  const router = useRouter();
  const [discordId, setDiscordId] = useState("");
  const [amount, setAmount] = useState("5");
  const [days, setDays] = useState("30");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [granted, setGranted] = useState<string | null>(null);
  /** Which patron's revoke is armed — the two-tap, same as Sell pack. */
  const [revokeArmed, setRevokeArmed] = useState<string | null>(null);

  const patrons = members.filter((member) => member.active);

  const grant = async () => {
    setBusy(true);
    setError(null);
    setGranted(null);
    const result = await grantPatronAction({
      discordId,
      amountUsd: Number(amount),
      days: Number(days) || 0,
      note: note.trim() || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const name = members.find((member) => member.discordId === discordId)?.username ?? "member";
    setGranted(`${name} is a patron until ${result.until ? dateLabel(result.until) : "—"}.`);
    setNote("");
    router.refresh();
  };

  const revoke = async (id: string) => {
    if (revokeArmed !== id) {
      setRevokeArmed(id);
      return;
    }
    setRevokeArmed(null);
    setBusy(true);
    setError(null);
    const result = await revokePatronAction(id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Record a payment ── */}
      <div className="card-brand flex flex-wrap items-end gap-3 p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="patron-member" className="label-dash">
            Member
          </label>
          <select
            id="patron-member"
            value={discordId}
            onChange={(event) => setDiscordId(event.target.value)}
            className={adminInputClass}
          >
            <option value="">Pick a member</option>
            {members.map((member) => (
              <option key={member.discordId} value={member.discordId}>
                {member.username}
                {member.active ? " · patron" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="patron-amount" className="label-dash">
            Paid ($)
          </label>
          <input
            id="patron-amount"
            type="number"
            min={1}
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={`${adminInputClass} w-24`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="patron-days" className="label-dash">
            Days
          </label>
          <input
            id="patron-days"
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(event) => setDays(event.target.value)}
            className={`${adminInputClass} w-20`}
          />
        </div>
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <label htmlFor="patron-note" className="label-dash">
            Note
          </label>
          <input
            id="patron-note"
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="venmo @handle, memo…"
            className={adminInputClass}
          />
        </div>
        <button
          type="button"
          disabled={busy || !discordId}
          onClick={() => void grant()}
          className="rounded-full border border-gold/60 bg-gold/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-gold disabled:opacity-50"
        >
          {busy ? "Working…" : "Record & grant"}
        </button>
        {granted ? <p className="w-full text-xs font-semibold text-mint">{granted}</p> : null}
        {error ? <p className="w-full text-xs text-red-400">{error}</p> : null}
      </div>

      {/* ── Active patrons ── */}
      <div className="card-brand flex flex-col gap-2 p-4">
        <span className="label-dash">Active patrons · {patrons.length}</span>
        {patrons.length === 0 ? (
          <p className="text-sm text-muted">Nobody is burning right now.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {patrons.map((patron) => (
              <li key={patron.discordId} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-white">{patron.username}</span>
                <span className="flex items-center gap-3">
                  <span className="text-muted">until {patron.patronUntil ? dateLabel(patron.patronUntil) : "—"}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void revoke(patron.discordId)}
                    className="rounded-full border border-border px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted transition-colors hover:border-red-400 hover:text-red-400 disabled:opacity-50"
                  >
                    {revokeArmed === patron.discordId ? "Sure?" : "Revoke"}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── The receipt book ── */}
      <div className="card-brand flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="label-dash">Receipts</span>
          <span className="text-xs font-semibold text-gold">
            ${thisMonth.toFixed(2)} this month · ${allTime.toFixed(2)} all time
          </span>
        </div>
        {receipts.length === 0 ? (
          <p className="text-sm text-muted">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead>
                <tr className="text-[0.65rem] uppercase tracking-wide text-muted">
                  <th className="py-1 pr-3 font-semibold">Member</th>
                  <th className="py-1 pr-3 font-semibold">Paid</th>
                  <th className="py-1 pr-3 font-semibold">Days</th>
                  <th className="py-1 pr-3 font-semibold">When</th>
                  <th className="py-1 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt) => (
                  <tr key={receipt.id} className="border-t border-border/50">
                    <td className="py-1.5 pr-3 font-semibold text-white">{receipt.username}</td>
                    <td className="py-1.5 pr-3 text-gold">${receipt.amountUsd.toFixed(2)}</td>
                    <td className="py-1.5 pr-3 text-muted">{receipt.daysGranted}</td>
                    <td className="py-1.5 pr-3 text-muted">{dateLabel(receipt.paidAt)}</td>
                    <td className="py-1.5 text-muted">{receipt.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
