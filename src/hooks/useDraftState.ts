"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchServerOffset, remainingMs } from "@/lib/time";
import { removeRow, upsertRow } from "@/lib/draft/realtimeRows";
import { resolvePlayerRank, type CanonicalPlayerMetadata } from "@/lib/draft/playerMetadata";
import type { Bid, Draft, Lot, Player, Team } from "@/lib/draft/types";

export function useDraftState(draftId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [offsetMs, setOffsetMs] = useState(0);
  const [connected, setConnected] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refetch = useCallback(async () => {
    const [d, t, p, l, canonical] = await Promise.all([
      supabase.from("drafts").select("*").eq("id", draftId).single(),
      supabase.from("teams").select("*").eq("draft_id", draftId).order("nomination_position"),
      supabase.from("players").select("*").eq("draft_id", draftId).order("display_name"),
      supabase.from("lots").select("*").eq("draft_id", draftId).order("created_at"),
      supabase.from("player_pool").select("id, display_name, rank").eq("season_key", "season-5"),
    ]);
    setDraft((d.data as Draft) ?? null);
    setTeams((t.data as Team[]) ?? []);
    const canonicalPlayers = (canonical.data as CanonicalPlayerMetadata[]) ?? [];
    setPlayers(((p.data as Player[]) ?? []).map((player) => ({
      ...player,
      rank: resolvePlayerRank(player, canonicalPlayers),
    })));
    const lotRows = (l.data as Lot[]) ?? [];
    setLots(lotRows);
    if (lotRows.length) {
      const { data: b } = await supabase.from("bids").select("*")
        .in("lot_id", lotRows.map((x) => x.id)).order("id");
      setBids((b as Bid[]) ?? []);
    } else setBids([]);
    setLoaded(true); // first fetch finished — a null draft now means "not found"
  }, [supabase, draftId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setProfileId(uid);
      if (!uid) return;
      supabase.from("profiles").select("is_admin").eq("id", uid).single().then(({ data: p }) => {
        setIsAdmin(p?.is_admin ?? false);
      });
    });
    fetchServerOffset(supabase).then(setOffsetMs);

    const upsert = upsertRow;
    const channel = supabase
      .channel(`draft:${draftId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "drafts", filter: `id=eq.${draftId}` },
        (m) => setDraft(m.new as Draft))
      .on("postgres_changes", { event: "*", schema: "public", table: "teams", filter: `draft_id=eq.${draftId}` },
        (m) => setTeams((cur) => upsert(cur, m.new as Team)))
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `draft_id=eq.${draftId}` },
        (m) => setPlayers((cur) => upsert(cur, m.new as Player)))
      .on("postgres_changes", { event: "*", schema: "public", table: "lots", filter: `draft_id=eq.${draftId}` },
        (m) => setLots((cur) => upsert(cur, m.new as Lot)))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bids" },
        (m) => setBids((cur) => upsert(cur, m.new as Bid)))
      // DELETEs need their own handlers, and unfiltered ones. Postgres sends
      // only the primary key in a DELETE's old record, so a `draft_id=eq.`
      // filter can never match and the event above is dropped — which is why a
      // deleted player used to linger on every board that was already open
      // while fresh loads never saw them. Removing by id is safe unfiltered:
      // ids are UUIDs, so another draft's id is simply absent from state.
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "players" },
        (m) => setPlayers((cur) => removeRow(cur, m.old as { id?: string })))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "teams" },
        (m) => setTeams((cur) => removeRow(cur, m.old as { id?: string })))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "lots" },
        (m) => setLots((cur) => removeRow(cur, m.old as { id?: string })))
      .subscribe((status) => {
        const ok = status === "SUBSCRIBED";
        setConnected(ok);
        if (ok) void refetch(); // initial load AND catch-up after reconnect
      });
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, draftId, refetch]);

  const openLot = useMemo(() => lots.find((l) => l.status === "open") ?? null, [lots]);
  const myTeam = useMemo(
    () => (
      profileId
        ? teams.find((t) => t.captain_profile_id === profileId || t.captain_profile_id_2 === profileId) ?? null
        : null
    ),
    [teams, profileId]
  );

  // Auto-close: first client to notice expiry finalizes the sale; retry every
  // 2s while the lot stays open in case a realtime message was dropped.
  // close_lot is a safe no-op server-side once the lot is already closed (or
  // not yet expired), so every tick can call it unconditionally — no local
  // "already tried" bookkeeping needed. Once the lot closes, the realtime
  // update nulls `openLot` and this effect's cleanup stops the timers.
  useEffect(() => {
    if (!openLot || draft?.status !== "live") return;
    const tryClose = () => {
      if (remainingMs(openLot.closes_at, offsetMs) === 0) {
        void supabase.rpc("close_lot", { p_lot_id: openLot.id }).then(undefined, () => {});
      }
    };
    const id = setInterval(tryClose, 2000);
    const t = setTimeout(tryClose, remainingMs(openLot.closes_at, offsetMs) + 100);
    return () => { clearInterval(id); clearTimeout(t); };
  }, [openLot, draft?.status, offsetMs, supabase]);

  return { draft, teams, players, lots, bids, profileId, isAdmin, myTeam, openLot, offsetMs, connected, loaded, refetch };
}
