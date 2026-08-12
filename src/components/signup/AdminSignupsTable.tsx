"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { duplicateSignupIds, signupsToCsv } from "@/lib/signup/admin";
import type { SignupRow } from "@/lib/signup/types";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const headClass =
  "px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-steel";

/** Staff view of the player pool — the sheet, but on the site. */
export default function AdminSignupsTable({ signups }: { signups: SignupRow[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [seasonFilter, setSeasonFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);

  const seasons = useMemo(
    () => Array.from(new Set(signups.map((s) => s.season))),
    [signups],
  );
  const visible = useMemo(
    () => (seasonFilter === "all" ? signups : signups.filter((s) => s.season === seasonFilter)),
    [signups, seasonFilter],
  );
  // Flagged across ALL signups, not just the visible slice, so a duplicate
  // stays flagged while a season filter is applied.
  const duplicates = useMemo(() => duplicateSignupIds(signups), [signups]);
  const [copied, setCopied] = useState(false);

  const handleCopyCsv = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(signupsToCsv(visible));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy to the clipboard — check browser permissions.");
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    const { error: deleteError } = await supabase.from("signups").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    router.refresh();
  };

  return (
    <div className="card-brand overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <span className="label-dash">
          Admin — signups ({visible.length}
          {seasonFilter === "all" ? " total" : ` in ${seasonFilter}`})
        </span>
        <div className="flex items-center gap-2">
          {visible.length > 0 && (
            <button
              type="button"
              onClick={() => void handleCopyCsv()}
              className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-gold hover:text-gold"
            >
              {copied ? "Copied!" : "Copy CSV"}
            </button>
          )}
          {seasons.length > 1 && (
            <select
              value={seasonFilter}
              onChange={(e) => setSeasonFilter(e.target.value)}
              aria-label="Filter signups by season"
              className="rounded border border-line bg-navy px-2 py-1 text-xs font-semibold text-white focus:border-gold focus:outline-none"
            >
              <option value="all">All seasons</option>
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="px-4 pt-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="px-4 py-4 text-sm text-steel">No signups yet.</p>
      ) : (
        <div className="overflow-x-auto p-2">
          <table className="w-full min-w-[1000px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={headClass}>When</th>
                <th className={headClass}>Season</th>
                <th className={headClass}>Discord</th>
                <th className={headClass}>Riot ID</th>
                <th className={headClass}>op.gg</th>
                <th className={headClass}>New/Ret</th>
                <th className={headClass}>Current</th>
                <th className={headClass}>Peak (2 szn)</th>
                <th className={headClass}>Roles</th>
                <th className={headClass}>Captain?</th>
                <th className={headClass}></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr
                  key={s.id}
                  className={`border-t border-line/60 align-top ${
                    duplicates.has(s.id) ? "bg-red-500/5" : ""
                  }`}
                >
                  <td className="whitespace-nowrap px-2 py-1.5 text-xs text-steel">
                    {formatDate(s.created_at)}
                  </td>
                  <td className="px-2 py-1.5 text-steel">{s.season}</td>
                  <td className="px-2 py-1.5 font-semibold text-white">
                    {s.discord}
                    {duplicates.has(s.id) && (
                      <span
                        title="Another signup this season shares this Discord or Riot ID"
                        className="ml-1.5 rounded-full border border-red-400/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-400"
                      >
                        Dup
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-steel">{s.riot_id}</td>
                  <td className="max-w-[16rem] px-2 py-1.5">
                    {/* First link only in the cell; full text in the title tooltip. */}
                    <a
                      href={s.opgg.split(/\s+/)[0]}
                      target="_blank"
                      rel="noreferrer"
                      title={s.opgg}
                      className="block truncate text-gold hover:underline"
                    >
                      {s.opgg}
                    </a>
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        s.player_status === "returning"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-gold/15 text-gold"
                      }`}
                    >
                      {s.player_status === "returning" ? "RET" : "NEW"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-steel">{s.current_rank}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-steel">{s.peak_rank}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 uppercase text-steel">
                    {s.primary_role}
                    {s.secondary_role ? ` / ${s.secondary_role}` : ""}
                  </td>
                  <td className="px-2 py-1.5 text-steel">{s.captain_interest ? "Yes" : "No"}</td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => void handleDelete(s.id)}
                      className="rounded-full border border-red-400/40 bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-400"
                      aria-label={`Delete signup from ${s.discord}`}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
