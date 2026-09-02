"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { errDetail } from "@/lib/draft/types";

export interface StaffProfile {
  id: string;
  display_name: string;
  is_admin: boolean;
  is_owner: boolean;
  is_broadcaster: boolean;
}

/** Owner-only staff management. Owners grant and revoke admin or broadcaster; admins have
 *  every other admin power but never reach this panel, and the RPC refuses
 *  them anyway. Owners are seeded in the database and cannot be changed here,
 *  which is what makes escalation unreachable from the site. */
export default function AdminStaff({ profiles }: { profiles: StaffProfile[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const setAdmin = async (profile: StaffProfile, next: boolean) => {
    if (busy) return;
    if (
      !next &&
      !confirm(`Remove admin access from ${profile.display_name}?`)
    ) return;
    setBusy(profile.id);
    setErr(null);
    const { error } = await supabase.rpc("set_profile_admin", {
      p_profile_id: profile.id,
      p_is_admin: next,
    });
    setBusy(null);
    if (error) {
      setErr(errDetail(error));
      return;
    }
    router.refresh();
  };

  const setBroadcaster = async (profile: StaffProfile, next: boolean) => {
    if (busy) return;
    if (!next && !confirm(`Remove broadcaster access from ${profile.display_name}?`)) return;
    setBusy(profile.id);
    setErr(null);
    const { error } = await supabase.rpc("set_profile_broadcaster", {
      p_profile_id: profile.id,
      p_is_broadcaster: next,
    });
    setBusy(null);
    if (error) {
      setErr(errDetail(error));
      return;
    }
    router.refresh();
  };

  const needle = query.trim().toLowerCase();
  // Every Discord sign-in creates a profile, so the list gets long fast:
  // show staff always, and everyone else only once searched for.
  const staff = profiles.filter((p) => p.is_owner || p.is_admin || p.is_broadcaster);
  const matches = needle
    ? profiles.filter(
        (p) =>
          !p.is_owner &&
          !p.is_admin &&
          !p.is_broadcaster &&
          p.display_name.toLowerCase().includes(needle)
      )
    : [];

  const row = (p: StaffProfile) => (
    <li
      key={p.id}
      className="flex items-center justify-between gap-3 rounded border border-border bg-canvas/40 px-3 py-2 text-sm"
    >
      <span className="min-w-0 truncate text-white">
        {p.display_name}
        {p.is_owner && (
          <span className="ml-2 rounded border border-gold/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
            Owner
          </span>
        )}
      </span>
      {p.is_owner ? (
        <span className="shrink-0 text-xs text-muted">Managed in the database</span>
      ) : (
        <span className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => setAdmin(p, !p.is_admin)}
            aria-label={`${p.is_admin ? "Remove admin from" : "Make admin"} ${p.display_name}`}
            className={`rounded px-2 py-1 text-xs font-semibold disabled:opacity-40 ${
              p.is_admin
                ? "border border-red-500/60 text-red-400"
                : "bg-primary text-white hover:brightness-110"
            }`}
          >
            {p.is_admin ? "Remove admin" : "Make admin"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => setBroadcaster(p, !p.is_broadcaster)}
            aria-label={`${p.is_broadcaster ? "Remove broadcaster from" : "Make broadcaster"} ${p.display_name}`}
            className={`rounded px-2 py-1 text-xs font-semibold disabled:opacity-40 ${
              p.is_broadcaster
                ? "border border-red-500/60 text-red-400"
                : "border border-mint/60 text-mint"
            }`}
          >
            {p.is_broadcaster ? "Remove broadcaster" : "Make broadcaster"}
          </button>
        </span>
      )}
    </li>
  );

  return (
    <section className="card-brand flex flex-col gap-3 p-4">
      <div>
        <h2 className="label-dash">Staff</h2>
        <p className="mt-1 text-xs text-muted">
          Owners can grant and revoke admin or broadcaster access. Admins cannot change anyone&apos;s access.
        </p>
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}

      <ul className="flex flex-col gap-1">{staff.map(row)}</ul>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Add someone
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          aria-label="Search people"
          className="input-brand px-2 py-1 text-sm"
        />
      </label>
      {needle && (
        <ul className="flex flex-col gap-1">
          {matches.map(row)}
          {matches.length === 0 && <li className="text-sm text-muted">Nobody matches that.</li>}
        </ul>
      )}
    </section>
  );
}
