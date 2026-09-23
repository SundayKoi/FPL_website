import "server-only";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import type { CardLeague } from "@/lib/cards/queries";

type Service = ReturnType<typeof createBettingServiceClient>;

export interface SeasonEndAutoDustResult {
  dusted: number;
  value: number;
  balance: number | null;
  remaining: number;
  ids: number[];
}

export async function fetchSeasonEndAutoDustEnabled(service: Service, discordId: string, league: CardLeague): Promise<boolean> {
  const { data, error } = await service.from("season_end_auto_dust").select("enabled").eq("discord_id", discordId).eq("league", league).maybeSingle();
  if (error) throw new Error(`Season's End auto-dust rule read failed: ${error.message}`);
  return (data as { enabled?: boolean } | null)?.enabled === true;
}

export async function saveSeasonEndAutoDustEnabled(service: Service, discordId: string, league: CardLeague, enabled: boolean): Promise<void> {
  const { error } = await service.from("season_end_auto_dust").upsert({ discord_id: discordId, league, enabled, updated_at: new Date().toISOString() }, { onConflict: "discord_id,league" });
  if (error) throw new Error(`Season's End auto-dust rule save failed: ${error.message}`);
}

export async function runSeasonEndAutoDust(service: Service, discordId: string, league: CardLeague, openingId?: string): Promise<SeasonEndAutoDustResult> {
  const { data, error } = await service.rpc("run_season_end_auto_dust", { p_user: discordId, p_league: league, p_opening: openingId ?? null });
  if (error) throw new Error(`Season's End auto-dust failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) throw new Error("Season's End auto-dust returned no result");
  return {
    dusted: Number(row.dusted ?? 0),
    value: Number(row.value ?? 0),
    balance: row.balance === null || row.balance === undefined ? null : Number(row.balance),
    remaining: Number(row.remaining ?? 0),
    ids: Array.isArray(row.ids) ? row.ids.map(Number) : [],
  };
}
