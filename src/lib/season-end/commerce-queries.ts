import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabase/pagination";
import type { SeasonEndOwnedCopy } from "./release-queries";

export interface SeasonEndMarketListing {
  id: number;
  releaseId: string;
  inventoryId: number;
  sellerDiscordId: string;
  sellerName: string;
  ask: number;
  note: string | null;
  createdAt: string;
  expiresAt: string;
  copy: SeasonEndOwnedCopy | null;
  stale: boolean;
}

export interface SeasonEndMarketWant {
  id: number;
  releaseId: string;
  designId: string;
  discordId: string;
  name: string;
  bounty: number;
  note: string | null;
  createdAt: string;
}

export interface SeasonEndTradeOffer {
  id: number;
  releaseId: string;
  fromDiscordId: string;
  fromName: string;
  toDiscordId: string;
  toName: string;
  offeredInventoryIds: number[];
  requestedInventoryIds: number[];
  offeredDollars: number;
  requestedDollars: number;
  status: "pending" | "accepted" | "declined" | "cancelled";
  createdAt: string;
}

type Row = Record<string, unknown>;

function copyRow(row: Row): SeasonEndOwnedCopy {
  return {
    inventoryId: Number(row.id),
    releaseId: String(row.release_id),
    openingId: String(row.opening_id),
    designId: String(row.design_id),
    slotPosition: Number(row.slot_position ?? 0),
    revealOrder: Number(row.reveal_order ?? 0),
    lifecycleStatus: row.lifecycle_status as SeasonEndOwnedCopy["lifecycleStatus"],
    foil: row.foil === true,
    foilType: typeof row.foil_type === "string" ? row.foil_type : null,
    signed: row.signed === true,
    autograph: typeof row.autograph === "string" ? row.autograph : null,
    payload: row.payload as SeasonEndOwnedCopy["payload"],
    economyVersion: String(row.economy_version ?? ""),
    rulesVersion: String(row.rules_version ?? ""),
  };
}

async function namesFor(client: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data, error } = await client.from("betting_profiles").select("discord_id, username").in("discord_id", ids);
  if (error) throw new Error(`Season's End profile read failed: ${error.message}`);
  return new Map(((data as Array<{ discord_id: string; username: string | null }> | null) ?? []).map((row) => [row.discord_id, row.username ?? row.discord_id]));
}

export async function fetchSeasonEndMarket(client: SupabaseClient, releaseId: string, viewerId?: string): Promise<{
  listings: SeasonEndMarketListing[];
  wants: SeasonEndMarketWant[];
  trades: SeasonEndTradeOffer[];
}> {
  const now = new Date().toISOString();
  const [listingRows, wantRows, tradeRows] = await Promise.all([
    fetchAllPages<Row>((from, to) => client.from("season_end_listings").select("id, release_id, inventory_id, seller_discord, ask, note, created_at, expires_at").eq("release_id", releaseId).eq("status", "open").gt("expires_at", now).order("id", { ascending: false }).range(from, to)),
    fetchAllPages<Row>((from, to) => client.from("season_end_wants").select("id, release_id, design_id, discord_id, bounty, note, created_at").eq("release_id", releaseId).eq("status", "open").order("id", { ascending: false }).range(from, to)),
    fetchAllPages<Row>((from, to) => {
      let query = client.from("season_end_trades").select("id, release_id, from_discord, to_discord, offered_inventory_ids, requested_inventory_ids, offered_dollars, requested_dollars, status, created_at, expires_at").eq("release_id", releaseId).eq("status", "pending").gt("expires_at", now);
      if (viewerId) query = query.or(`from_discord.eq.${viewerId},to_discord.eq.${viewerId}`);
      return query.order("id", { ascending: false }).range(from, to);
    }),
  ]);
  const inventoryIds = [...new Set(listingRows.map((row) => Number(row.inventory_id)))];
  const tradeInventoryIds = [...new Set(tradeRows.flatMap((row) => [ ...(Array.isArray(row.offered_inventory_ids) ? row.offered_inventory_ids : []), ...(Array.isArray(row.requested_inventory_ids) ? row.requested_inventory_ids : []) ].map(Number)))];
  const allInventoryIds = [...new Set([...inventoryIds, ...tradeInventoryIds])];
  const [inventoryResult, names] = await Promise.all([
    allInventoryIds.length
      ? client.from("season_end_inventory").select("id, release_id, opening_id, design_id, slot_position, reveal_order, lifecycle_status, foil, foil_type, signed, autograph, payload, economy_version, rules_version, discord_id").in("id", allInventoryIds).eq("mode", "public")
      : Promise.resolve({ data: [], error: null }),
    namesFor(client, [...new Set([...listingRows.map((row) => String(row.seller_discord)), ...wantRows.map((row) => String(row.discord_id)), ...tradeRows.flatMap((row) => [String(row.from_discord), String(row.to_discord)])])]),
  ]);
  if (inventoryResult.error) throw new Error(`Season's End inventory read failed: ${inventoryResult.error.message}`);
  const inventory = new Map<number, SeasonEndOwnedCopy & { owner: string }>();
  for (const row of ((inventoryResult.data as Row[] | null) ?? [])) inventory.set(Number(row.id), { ...copyRow(row), owner: String(row.discord_id) });

  return {
    listings: listingRows.map((row) => {
      const copy = inventory.get(Number(row.inventory_id));
      return {
        id: Number(row.id), releaseId: String(row.release_id), inventoryId: Number(row.inventory_id), sellerDiscordId: String(row.seller_discord), sellerName: names.get(String(row.seller_discord)) ?? String(row.seller_discord), ask: Number(row.ask), note: typeof row.note === "string" ? row.note : null, createdAt: String(row.created_at), expiresAt: String(row.expires_at), copy: copy ?? null, stale: !copy || copy.owner !== String(row.seller_discord) || copy.lifecycleStatus !== "active",
      };
    }),
    wants: wantRows.map((row) => ({ id: Number(row.id), releaseId: String(row.release_id), designId: String(row.design_id), discordId: String(row.discord_id), name: names.get(String(row.discord_id)) ?? String(row.discord_id), bounty: Number(row.bounty), note: typeof row.note === "string" ? row.note : null, createdAt: String(row.created_at) })),
    trades: tradeRows.map((row) => ({ id: Number(row.id), releaseId: String(row.release_id), fromDiscordId: String(row.from_discord), fromName: names.get(String(row.from_discord)) ?? String(row.from_discord), toDiscordId: String(row.to_discord), toName: names.get(String(row.to_discord)) ?? String(row.to_discord), offeredInventoryIds: Array.isArray(row.offered_inventory_ids) ? row.offered_inventory_ids.map(Number) : [], requestedInventoryIds: Array.isArray(row.requested_inventory_ids) ? row.requested_inventory_ids.map(Number) : [], offeredDollars: Number(row.offered_dollars ?? 0), requestedDollars: Number(row.requested_dollars ?? 0), status: row.status as SeasonEndTradeOffer["status"], createdAt: String(row.created_at) })),
  };
}
