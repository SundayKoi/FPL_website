"use client";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtPoints } from "@/lib/betting/format";
import { grantPoints } from "@/lib/betting/admin-actions";

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
      <label className="flex flex-col gap-1 text-xs text-steel">
        Discord id
        <input
          value={discordId}
          onChange={(e) => setDiscordId(e.target.value)}
          className="w-40 rounded border border-line bg-navy px-2 py-1.5 text-sm text-white placeholder:text-steel/60 focus:border-gold focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-steel">
        Amount (+/-)
        <input
          type="number"
          value={delta}
          onChange={(e) => setDelta(Math.trunc(Number(e.target.value) || 0))}
          className="w-28 rounded border border-line bg-navy px-2 py-1.5 text-sm text-white focus:border-gold focus:outline-none"
        />
      </label>
      <label className="flex flex-1 min-w-[10rem] flex-col gap-1 text-xs text-steel">
        Reason
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. tournament prize"
          className="rounded border border-line bg-navy px-2 py-1.5 text-sm text-white placeholder:text-steel/60 focus:border-gold focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !canSubmit}
        className="rounded bg-gold px-4 py-2 text-sm font-display font-bold not-italic text-navy hover:brightness-110 disabled:opacity-40"
      >
        Grant / deduct
      </button>
    </form>
  );
}

export default function UsersAdmin({ balances: initialBalances, audit }: { balances: BalanceRow[]; audit: AuditRow[] }) {
  const supabase = createClient();
  const [balances, setBalances] = useState(initialBalances);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const search = async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setBalances(initialBalances);
      return;
    }
    const { data } = await supabase
      .from("betting_profiles")
      .select("discord_id, username, avatar_url, balance")
      .or(`username.ilike.%${q}%,discord_id.ilike.%${q}%`)
      .order("balance", { ascending: false })
      .limit(50);
    setBalances((data as BalanceRow[] | null) ?? []);
  };

  return (
    <div className="flex flex-col gap-8">
      {error && <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      {notice && <p className="rounded border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold">{notice}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="label-dash">Grant / deduct</h2>
        <p className="text-xs text-steel">
          Not available yet — no admin balance-adjustment RPC has been ported for this build (see task-9-report.md). Submitting
          below is staff-gated and validated, but will not move any balance.
        </p>
        <GrantForm
          busy={pending}
          onSubmit={(discordId, delta, reason) =>
            startTransition(async () => {
              const result = await grantPoints(discordId, delta, reason);
              if (!result.ok) {
                setNotice(null);
                setError(result.error);
                return;
              }
              setError(null);
              setNotice("Balance adjusted.");
            })
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
            className="w-64 rounded border border-line bg-navy px-2 py-1.5 text-sm text-white placeholder:text-steel/60 focus:border-gold focus:outline-none"
          />
        </div>
        <ul className="flex flex-col gap-1.5">
          {balances.map((b) => (
            <li key={b.discord_id} className="flex items-center justify-between gap-2 rounded border border-line bg-panel px-3 py-1.5 text-sm">
              <span className="flex items-center gap-2">
                <span className="font-medium text-white">{b.username}</span>
                <span className="text-xs text-steel">{b.discord_id}</span>
              </span>
              <span className="font-semibold text-gold">{fmtPoints(b.balance)}</span>
            </li>
          ))}
          {balances.length === 0 && <p className="text-sm text-steel">No matching wallets.</p>}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label-dash">Audit trail</h2>
        {audit.length === 0 ? (
          <p className="text-sm text-steel">No admin actions logged yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {audit.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded border border-line bg-panel px-3 py-1.5 text-xs">
                <span className="text-steel">
                  <span className="text-white">{a.actor}</span> · {a.action}
                  {a.target ? ` · ${a.target}` : ""}
                </span>
                <span className="shrink-0 text-steel/70">{new Date(a.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
