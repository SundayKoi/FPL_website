"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ROLE_ORDER, type LolRole, type Player } from "@/lib/draft/types";

interface ParsedRow {
  line: number;
  raw: string;
  display_name?: string;
  role?: LolRole;
  rank?: string | null;
  opgg_url?: string | null;
  error?: string;
}

function parseCsv(text: string): ParsedRow[] {
  return text
    .split("\n")
    .map((raw, i) => ({ raw: raw.trim(), line: i + 1 }))
    .filter((r) => r.raw.length > 0)
    .map(({ raw, line }) => {
      const parts = raw.split(",").map((s) => s.trim());
      const [name, roleRaw, rank, opgg] = parts;
      if (!name) return { line, raw, error: "missing name" };
      if (!roleRaw) return { line, raw, error: "missing role" };
      const role = ROLE_ORDER.find((r) => r === roleRaw.toLowerCase());
      if (!role) {
        return {
          line,
          raw,
          error: `unknown role "${roleRaw}" (expected one of ${ROLE_ORDER.join(", ")})`,
        };
      }
      return {
        line,
        raw,
        display_name: name,
        role,
        rank: rank || null,
        opgg_url: opgg || null,
      };
    });
}

export default function PlayerPoolEditor({
  draftId,
  players,
  onChanged,
}: {
  draftId: string;
  players: Player[];
  onChanged: () => void | Promise<void>;
}) {
  const supabase = createClient();
  const pool = players.filter((p) => !p.team_id);
  const [csv, setCsv] = useState("");
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleParse = () => {
    setErr(null);
    setParsed(parseCsv(csv));
  };

  const handleImport = async () => {
    const valid = parsed.filter((r) => !r.error);
    if (valid.length === 0) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("players").insert(
      valid.map((r) => ({
        draft_id: draftId,
        display_name: r.display_name,
        role: r.role,
        rank: r.rank,
        opgg_url: r.opgg_url,
      }))
    );
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setCsv("");
    setParsed([]);
    await onChanged();
  };

  const removePlayer = async (player: Player) => {
    if (!confirm(`Remove "${player.display_name}" from the pool?`)) return;
    setErr(null);
    const { error } = await supabase.from("players").delete().eq("id", player.id);
    if (error) setErr(error.message);
    else await onChanged();
  };

  const validCount = parsed.filter((r) => !r.error).length;
  const errorRows = parsed.filter((r) => r.error);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-zinc-100">Player pool</h2>
      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 p-4">
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          CSV paste — one player per line: name,role[,rank[,opgg_url]]
        </label>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={6}
          placeholder={"Faker,mid,Challenger,https://op.gg/...\nCanyon,jungle"}
          className="rounded border border-zinc-700 bg-black/30 px-2 py-1 font-mono text-xs text-zinc-100 placeholder:text-zinc-600"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleParse}
            disabled={!csv.trim()}
            className="rounded bg-zinc-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            Validate
          </button>
          {parsed.length > 0 && (
            <button
              onClick={handleImport}
              disabled={busy || validCount === 0}
              className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Import {validCount} valid row{validCount === 1 ? "" : "s"}
            </button>
          )}
        </div>
        {parsed.length > 0 && (
          <div className="flex flex-col gap-1 text-xs">
            {errorRows.length > 0 && (
              <ul className="flex flex-col gap-0.5 text-red-400">
                {errorRows.map((r) => (
                  <li key={r.line}>
                    Line {r.line}: {r.error} — &quot;{r.raw}&quot;
                  </li>
                ))}
              </ul>
            )}
            <p className="text-zinc-500">
              {validCount} valid, {errorRows.length} invalid
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Pool ({pool.length})
        </h3>
        {pool.length === 0 ? (
          <p className="text-sm opacity-60">No pool players yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-1">Name</th>
                <th className="py-1">Role</th>
                <th className="py-1">Rank</th>
                <th className="py-1">op.gg</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {pool.map((p) => (
                <tr key={p.id} className="border-t border-zinc-800">
                  <td className="py-1 text-zinc-100">{p.display_name}</td>
                  <td className="py-1 text-zinc-400">{p.role}</td>
                  <td className="py-1 text-zinc-400">{p.rank ?? "—"}</td>
                  <td className="py-1 text-zinc-400">
                    {p.opgg_url ? (
                      <a href={p.opgg_url} target="_blank" rel="noreferrer" className="underline">
                        link
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-1 text-right">
                    <button
                      onClick={() => removePlayer(p)}
                      className="rounded bg-red-800 px-2 py-0.5 text-xs font-semibold text-white"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
