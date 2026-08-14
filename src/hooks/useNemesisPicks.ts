"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { NemesisPick } from "@/lib/draft/types";

/** Live nemesis chain for a draft. Kept out of useDraftState, which already
 *  carries five tables. Refetches whole rather than patching rows: the list is
 *  tiny and a reset deletes every row at once. */
export function useNemesisPicks(draftId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [picks, setPicks] = useState<NemesisPick[]>([]);

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from("nemesis_picks")
      .select("*")
      .eq("draft_id", draftId)
      .order("pick_number");
    setPicks((data as NemesisPick[]) ?? []);
  }, [supabase, draftId]);

  useEffect(() => {
    const ch = supabase
      .channel(`nemesis:${draftId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nemesis_picks", filter: `draft_id=eq.${draftId}` },
        () => void refetch()
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") void refetch(); // initial load and reconnect catch-up
      });
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, draftId, refetch]);

  return { picks };
}
