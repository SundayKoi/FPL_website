"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RoleSection, SeasonKey } from "@/lib/players/seasonData";
import type { LeagueKey } from "@/lib/players/identity";
import PlayerIdentityAdmin, {
  type PlayerIdentityLinkRow,
  type VerifiedProfileOption,
} from "@/components/players/PlayerIdentityAdmin";

export type PlayerPoolRow = {
  id: string;
  season_key: SeasonKey;
  display_name: string;
  role: RoleSection["key"];
  rank: string | null;
  opgg_url: string | null;
};

type Props = {
  seasonKey: SeasonKey;
  players: PlayerPoolRow[];
  onPlayersChange: (players: PlayerPoolRow[]) => void;
  identityLeague?: LeagueKey;
  identitySeason?: string;
  identityLinks?: PlayerIdentityLinkRow[];
  identityProfiles?: VerifiedProfileOption[];
};
const roles: RoleSection["key"][] = ["top", "jungle", "mid", "adc", "support"];

export default function PlayerPoolAdmin({
  seasonKey,
  players,
  onPlayersChange,
  identityLeague,
  identitySeason,
  identityLinks = [],
  identityProfiles = [],
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ display_name: "", role: "top" as RoleSection["key"], rank: "", opgg_url: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const reset = () => { setEditingId(null); setForm({ display_name: "", role: "top", rank: "", opgg_url: "" }); setError(null); };
  const beginEdit = (player: PlayerPoolRow) => { setEditingId(player.id); setForm({ display_name: player.display_name, role: player.role, rank: player.rank ?? "", opgg_url: player.opgg_url ?? "" }); setError(null); };
  const save = async () => {
    const name = form.display_name.trim();
    if (!name || !form.opgg_url.trim()) return setError("Player name and OP.GG URL are required.");
    try { new URL(form.opgg_url.trim()); } catch { return setError("OP.GG URL must be a valid URL."); }
    setSaving(true); setError(null);
    const payload = { display_name: name, role: form.role, rank: form.rank.trim() || null, opgg_url: form.opgg_url.trim() };
    const normalized = name.toLowerCase().replace(/^captain:\s*/, "").replace(/\s*#.*$/, "").replace(/\s+/g, " ");
    const result = editingId
      ? await createClient().from("player_pool").update(payload).eq("id", editingId).select("id, season_key, display_name, role, rank, opgg_url").single()
      : await createClient().from("player_pool").insert({ ...payload, season_key: seasonKey, normalized_name: normalized }).select("id, season_key, display_name, role, rank, opgg_url").single();
    setSaving(false);
    if (result.error || !result.data) return setError(result.error?.message ?? "Unable to save player.");
    const row = result.data as PlayerPoolRow;
    onPlayersChange(editingId ? players.map((player) => player.id === editingId ? row : player) : [...players, row]);
    reset();
  };
  const remove = async (player: PlayerPoolRow) => {
    if (!window.confirm(`Remove ${player.display_name} from the shared player pool? Draft history will be preserved.`)) return;
    setSaving(true); setError(null);
    const { error: deleteError } = await createClient().from("player_pool").delete().eq("id", player.id);
    setSaving(false);
    if (deleteError) return setError(deleteError.message);
    onPlayersChange(players.filter((candidate) => candidate.id !== player.id));
  };
  return <section aria-label="Player pool administration" className="mb-8 rounded border border-coral/40 bg-coral/5 p-4 sm:p-6">
    <p className="mb-4 text-sm text-coral">Removing a canonical player preserves linked draft records and clears only their canonical link.</p>
    {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_minmax(0,1.5fr)_auto]">
      <input aria-label="Player name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Player name" className="rounded border border-line bg-navy px-3 py-2 text-sm text-white" />
      <select aria-label="Player role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as RoleSection["key"] })} className="rounded border border-line bg-navy px-3 py-2 text-sm text-white">{roles.map((role) => <option key={role} value={role}>{role.toUpperCase()}</option>)}</select>
      <input aria-label="Player rank" value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })} placeholder="Rank" className="rounded border border-line bg-navy px-3 py-2 text-sm text-white" />
      <input aria-label="Player OP.GG URL" value={form.opgg_url} onChange={(e) => setForm({ ...form, opgg_url: e.target.value })} placeholder="https://op.gg/..." className="rounded border border-line bg-navy px-3 py-2 text-sm text-white" />
      <div className="flex gap-2"><button type="button" onClick={() => void save()} disabled={saving} className="rounded border border-coral px-3 py-2 text-sm font-semibold text-coral">{editingId ? "Save" : "Add"}</button>{editingId ? <button type="button" onClick={reset} className="rounded border border-line px-3 py-2 text-sm text-steel">Cancel</button> : null}</div>
    </div>
    <ul className="mt-5 divide-y divide-line/50">{players.map((player) => <li key={player.id} className="py-2 text-sm text-white"><div className="flex flex-wrap items-center justify-between gap-3"><span>{player.display_name} <span className="text-steel">({player.role}, {player.rank ?? "—"})</span></span><span className="flex gap-2"><button type="button" onClick={() => beginEdit(player)} className="text-coral underline">Edit</button><button type="button" onClick={() => void remove(player)} disabled={saving} className="text-red-400 underline">Remove</button></span></div>{identityLeague && identitySeason ? <PlayerIdentityAdmin playerPoolId={player.id} league={identityLeague} season={identitySeason} currentLink={identityLinks.find((link) => link.playerPoolId === player.id) ?? null} profiles={identityProfiles} /> : null}</li>)}</ul>
  </section>;
}
