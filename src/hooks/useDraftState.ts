"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchServerOffset, remainingMs } from "@/lib/time";
import type { Bid, Draft, Lot, Player, Team } from "@/lib/draft/types";

export function useDraftState(draftId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [connected, setConnected] = useState(false);

  const refetch = useCallback(async () => {
    const [d, t, p, l] = await Promise.all([
      supabase.from("drafts").select("*").eq("id", draftId).single(),
      supabase.from("teams").select("*").eq("draft_id", draftId).order("nomination_position"),
      supabase.from("players").select("*").eq("draft_id", draftId).order("display_name"),
      supabase.from("lots").select("*").eq("draft_id", draftId).order("created_at"),
    ]);
    setDraft((d.data as Draft) ?? null);
    setTeams((t.data as Team[]) ?? []);
    setPlayers((p.data as Player[]) ?? []);
    const lotRows = (l.data as Lot[]) ?? [];
    setLots(lotRows);
    if (lotRows.length) {
      const { data: b } = await supabase.from("bids").select("*")
        .in("lot_id", lotRows.map((x) => x.id)).order("id");
      setBids((b as Bid[]) ?? []);
    } else setBids([]);
  }, [supabase, draftId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setProfileId(data.user?.id ?? null));
    fetchServerOffset(supabase).then(setOffsetMs);

    // Realtime DELETE payloads carry an empty `new`, so `row.id` would be
    // undefined; skip those instead of upserting a corrupt row into state.
    const upsert = <T extends { id: unknown }>(rows: T[], row: T) => {
      if (row.id == null) return rows;
      const i = rows.findIndex((r) => r.id === row.id);
      return i === -1 ? [...rows, row] : rows.map((r, j) => (j === i ? row : r));
    };
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
      .subscribe((status) => {
        const ok = status === "SUBSCRIBED";
        setConnected(ok);
        if (ok) void refetch(); // initial load AND catch-up after reconnect
      });
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, draftId, refetch]);

  const openLot = useMemo(() => lots.find((l) => l.status === "open") ?? null, [lots]);
  const myTeam = useMemo(
    () => teams.find((t) => t.captain_profile_id === profileId) ?? null,
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

  return { draft, teams, players, lots, bids, profileId, myTeam, openLot, offsetMs, connected, refetch };
}
