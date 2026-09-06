"use server";

import { revalidatePath } from "next/cache";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { getBettingUser } from "@/lib/betting/wallet";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { FANTASY_ROLES, type FantasyRole } from "./config";
import type { StoredSlot, StoredSlots } from "./scoring";
import { validateLineup, type LineupSlotInput } from "./validate";
import { slabRefusal } from "@/lib/cards/wear";
import { currentFantasyWeek, isLocked } from "./week";

type SubmitResult = { ok: true; weekStart: string } | { ok: false; error: string };

interface InventoryDbRow {
  id: number;
  discord_id: string;
  season: string;
  slug: string;
  player_name: string;
  role: string;
  overall: number;
  edition_week: string;
  foil: boolean;
  /** `card->slab`, aliased in the select: a sealed copy cannot be fielded. */
  slab?: unknown;
}

/**
 * Files (or replaces) the caller's lineup for the week that is currently
 * open.
 *
 * Only the league and five card ids travel over the wire. Everything that
 * decides whether the entry is legal — who is submitting, which season,
 * which week, and what each card actually is — is re-derived server-side:
 * the ids are looked up in card_inventory with the service client and the
 * rules re-run against those rows, so a client that lies about a card's
 * role or OVR is simply overruled rather than believed.
 */
export async function submitLineupAction(
  league: CardLeague,
  slotIds: Record<FantasyRole, number>,
): Promise<SubmitResult> {
  const chosen: { role: FantasyRole; id: number }[] = [];
  for (const role of FANTASY_ROLES) {
    const id = slotIds?.[role];
    if (!Number.isInteger(id)) return { ok: false, error: "Fantasy lineups need one card in every role." };
    chosen.push({ role, id });
  }

  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };

  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, league);
  if (!season) return { ok: false, error: "No season is set up for fantasy yet." };

  const week = currentFantasyWeek(new Date());
  // Belt and braces: currentFantasyWeek never returns a locked week, so this
  // can only fire if the clock crossed 22:00 UTC between that call and here.
  if (isLocked(week, new Date())) return { ok: false, error: "This week's lineup is locked." };

  const ids = chosen.map((slot) => slot.id);
  const { data, error } = await service
    .from("card_inventory")
    .select("id, discord_id, season, slug, player_name, role, overall, edition_week, foil, slab:card->slab")
    .in("id", [...new Set(ids)]);
  if (error) return { ok: false, error: "Couldn't read your collection — try again." };

  const owned = new Map<number, InventoryDbRow>();
  for (const row of (data as InventoryDbRow[]) ?? []) {
    // Ownership and season are checked here rather than in the query so a
    // card belonging to someone else fails as "you don't own that" instead
    // of silently disappearing into the missing-row branch below.
    if (row.discord_id !== user.discordId || row.season !== season) continue;
    owned.set(row.id, row);
  }
  if (chosen.some((slot) => !owned.has(slot.id))) {
    return { ok: false, error: "You can only field cards you own." };
  }
  const sealed = chosen.map((slot) => owned.get(slot.id)!).find((row) => row.slab);
  if (sealed) return { ok: false, error: slabRefusal(sealed.player_name) };

  const slots: LineupSlotInput[] = chosen.map((slot) => {
    const row = owned.get(slot.id)!;
    return {
      role: slot.role,
      inventory: { id: row.id, slug: row.slug, playerName: row.player_name, role: row.role, overall: row.overall },
    };
  });
  const verdict = validateLineup(slots);
  if (!verdict.ok) return { ok: false, error: verdict.error };

  // Denormalized on purpose: the entry has to survive the copy being traded
  // away or restated later, and the leaderboard renders a week's lineups
  // without touching the (service-role-only) inventory table.
  const storedSlots: StoredSlots = {};
  for (const slot of chosen) {
    const row = owned.get(slot.id)!;
    const stored: StoredSlot = {
      inventoryId: row.id,
      slug: row.slug,
      playerName: row.player_name,
      overall: row.overall,
      editionWeek: row.edition_week,
      foil: row.foil,
    };
    storedSlots[slot.role] = stored;
  }

  const { error: upsertError } = await service.from("fantasy_lineups").upsert(
    {
      discord_id: user.discordId,
      season,
      week_start: week,
      slots: storedSlots,
      total_overall: verdict.totalOverall,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "discord_id,season,week_start" },
  );
  if (upsertError) return { ok: false, error: "Couldn't save that lineup — try again." };

  revalidatePath("/cards/fantasy");
  revalidatePath("/academy/cards/fantasy");
  return { ok: true, weekStart: week };
}
