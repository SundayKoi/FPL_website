"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computePools } from "@/lib/betting/pools";
import type { MarketDetailData, MarketStatus, OpenBetRow } from "@/lib/betting/types";
import {
  connectionStatusForChannel,
  type LiveConnectionStatus,
} from "@/lib/realtime/connection";

/**
 * Live-updates one market's pools/status on the client. Pattern ported from
 * src/hooks/useDraftState.ts's realtime channel: subscribe to
 * `postgres_changes` on the two tables that move a market's odds —
 * `betting_bets` INSERT (a new stake) and `betting_markets` UPDATE (lock/
 * resolve/cancel) — filtered to this market, and refetch the bets whenever
 * either fires. Both tables are public-read under RLS
 * (20260813000001_betting_schema.sql), so the anon browser client is enough;
 * no server-only data crosses here.
 */
export function useMarketDetail(marketId: number, initial: MarketDetailData) {
  const supabase = useMemo(() => createClient(), []);
  const [market, setMarket] = useState<MarketDetailData>(initial);
  const [connectionStatus, setConnectionStatus] = useState<LiveConnectionStatus>("connecting");

  // A page navigation to a different market swaps `initial` in wholesale.
  // Compare-and-adjust during render (not in an effect body, which the lint
  // config flags as a synchronous setState-in-effect) — same pattern as
  // BidControls.tsx's "prevKey" and LockCountdown.tsx.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setMarket(initial);
  }

  const refetchPools = useCallback(async () => {
    const { data } = await supabase
      .from("betting_bets")
      .select("discord_id, team_id, is_draw, amount")
      .eq("market_id", marketId);
    const bets = (data as { discord_id: string; team_id: number | null; is_draw: boolean; amount: number }[] | null) ?? [];
    const { poolA, poolB, poolDraw } = computePools(bets, initial.team_a.id, initial.team_b.id);
    setMarket((cur) => ({
      ...cur,
      pool_a: poolA,
      pool_b: poolB,
      pool_draw: poolDraw,
      top_bets: bets
        .map((b) => ({
          discord_id: b.discord_id,
          username: cur.top_bets.find((t) => t.discord_id === b.discord_id)?.username ?? b.discord_id,
          team_id: b.team_id,
          is_draw: b.is_draw,
          amount: b.amount,
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10),
    }));
  }, [supabase, marketId, initial.team_a.id, initial.team_b.id]);

  useEffect(() => {
    const channel = supabase
      .channel(`betting-market:${marketId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "betting_bets", filter: `market_id=eq.${marketId}` },
        () => void refetchPools()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "betting_markets", filter: `id=eq.${marketId}` },
        (payload) => {
          const row = payload.new as { status?: MarketStatus; winning_team_id?: number | null; drawn?: boolean };
          if (!row.status) return;
          setMarket((cur) => ({
            ...cur,
            status: row.status!,
            winning_team_id: row.winning_team_id ?? cur.winning_team_id,
            drawn: row.drawn ?? cur.drawn,
          }));
        }
      )
      .subscribe((status) => {
        const next = connectionStatusForChannel(status);
        if (!next) return;
        setConnectionStatus(next);
        if (next === "connected") void refetchPools();
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, marketId, refetchPools]);

  return {
    market,
    connected: connectionStatus === "connected",
    connectionStatus,
    refetch: refetchPools,
  };
}

/** The signed-in viewer's own open bets on a market, refetched after a
 * placeBet/cashoutBet round trip (its revalidatePath doesn't reach client
 * state, so the caller re-pulls this after an action settles). */
export async function fetchMyOpenBets(marketId: number): Promise<OpenBetRow[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const discordId = user?.identities?.find((i) => i.provider === "discord")?.id;
  if (!discordId) return [];
  const { data } = await supabase
    .from("betting_bets")
    .select("id, market_id, team_id, is_draw, amount")
    .eq("discord_id", discordId)
    .eq("market_id", marketId)
    .eq("settled", false);
  return (data as OpenBetRow[] | null) ?? [];
}
