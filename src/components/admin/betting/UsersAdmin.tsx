"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtPoints } from "@/lib/betting/format";
import { grantPoints } from "@/lib/betting/admin-actions";
import { ErrorBanner, useAdminRun } from "./useAdminRun";

export interface BalanceRow {
  discord_id: string;
  username: string;
  avatar_url: string | null;
  balance: number;
}

export interface AuditRow {
  id: number;
  actor: string;
  action: string;
  target: string | null;
  created_at: string;
}

function GrantForm({ busy, onSubmit }: { busy: boolean; onSubmit: (discordId: string, delta: number, reason: string) => void }) {
  const [discordId, setDiscordId] = useState("");
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("");
  const canSubmit = discordId.trim() && delta !== 0 && reason.trim();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit(discordId.trim(), delta, reason.trim());
      }}
      className="card-brand flex flex-wrap items-end gap-2 p-4"
    >
      <label className="flex flex-col gap-1 text-xs text-muted">
        Discord id
        <input
          value={discordId}
          onChange={(e) => setDiscordId(e.target.value)}
          className="w-40 input-brand px-2 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Amount (+/-)
        <input
          type="number"
          value={delta}
          onChange={(e) => setDelta(Math.trunc(Number(e.target.value) || 0))}
          className="w-28 input-brand px-2 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-1 min-w-[10rem] flex-col gap-1 text-xs text-muted">
        Reason
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. tournament prize"
          className="input-brand px-2 py-1.5 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !canSubmit}
        className="btn-primary px-4 py-2 text-sm"
      >
        Grant / deduct
      </button>
    </form>
  );
}

export default function UsersAdmin({ balances: initialBalances, audit }: { balances: BalanceRow[]; audit: AuditRow[] }) {
  const supabase = createClient();
  // `null` = no active search, so a router.refresh() after a grant (which
  // re-fetches `initialBalances` server-side with the updated balance) shows
  // up immediately without a separate effect re-syncing local state.
  const [searchResults, setSearchResults] = useState<BalanceRow[] | null>(null);
  const [query, setQuery] = useState("");
  const balances = searchResults ?? initialBalances;
  const [notice, setNotice] = useState<string | null>(null);
  const { error, pending, run } = useAdminRun();

  const search = async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    const { data } = await supabase
      .from("betting_profiles")
      .select("discord_id, username, avatar_url, balance")
      .or(`username.ilike.%${q}%,discord_id.ilike.%${q}%`)
      .order("balance", { ascending: false })
      .limit(50);
    setSearchResults((data as BalanceRow[] | null) ?? []);
  };

  return (
    <div className="flex flex-col gap-8">
      <ErrorBanner error={error} />
      {notice && <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{notice}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="label-dash">Grant / deduct</h2>
        <p className="text-xs text-muted">Positive amounts credit the wallet, negative amounts deduct — every change is audited below.</p>
        <GrantForm
          busy={pending}
          onSubmit={(discordId, delta, reason) =>
            run(
              async () => {
                const result = await grantPoints(discordId, delta, reason);
                if (!result.ok) setNotice(null); // never show a stale success next to the error
                return result;
              },
              () => setNotice("Balance adjusted."),
            )
          }
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="label-dash">Balances</h2>
          <input
            value={query}
            onChange={(e) => void search(e.target.value)}
            placeholder="Search by username or Discord id"
            className="w-64 input-brand px-2 py-1.5 text-sm"
          />
        </div>
        <ul className="flex flex-col gap-1.5">
          {balances.map((b) => (
            <li key={b.discord_id} className="flex items-center justify-between gap-2 rounded border border-border-subtle bg-surface px-3 py-1.5 text-sm">
              <span className="flex items-center gap-2">
                <span className="font-medium text-white">{b.username}</span>
                <span className="text-xs text-muted">{b.discord_id}</span>
              </span>
              <span className="font-semibold text-gold">{fmtPoints(b.balance)}</span>
            </li>
          ))}
          {balances.length === 0 && <p className="text-sm text-muted">No matching wallets.</p>}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label-dash">Audit trail</h2>
        {audit.length === 0 ? (
          <p className="text-sm text-muted">No admin actions logged yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {audit.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded border border-border-subtle bg-surface px-3 py-1.5 text-xs">
                <span className="text-muted">
                  <span className="text-white">{a.actor}</span> · {a.action}
                  {a.target ? ` · ${a.target}` : ""}
                </span>
                <span className="shrink-0 text-muted/70">{new Date(a.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
