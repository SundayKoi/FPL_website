"use server";

import { revalidatePath } from "next/cache";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { getBettingUser } from "@/lib/betting/wallet";
import type { CardLeague } from "@/lib/cards/queries";
import { runSeasonEndAutoDust, saveSeasonEndAutoDustEnabled, type SeasonEndAutoDustResult } from "./autoDustServer";

function validLeague(value: unknown): value is CardLeague {
  return value === "premier" || value === "academy";
}

async function member(): Promise<{ discordId: string } | { error: string }> {
  const user = await getBettingUser();
  if (!user) return { error: "Sign in to manage Season's End auto-dust." };
  if (!user.allowed) return { error: "FPL Better members only." };
  return { discordId: user.discordId };
}

export async function saveSeasonEndAutoDustAction(league: CardLeague, enabled: boolean): Promise<{ ok: true; enabled: boolean } | { ok: false; error: string }> {
  if (!validLeague(league) || typeof enabled !== "boolean") return { ok: false, error: "Invalid auto-dust setting." };
  const user = await member();
  if ("error" in user) return { ok: false, error: user.error };
  try {
    await saveSeasonEndAutoDustEnabled(createBettingServiceClient(), user.discordId, league, enabled);
    return { ok: true, enabled };
  } catch (error) {
    console.error("season-end: auto-dust rule save failed", error);
    return { ok: false, error: "Could not save the Season's End auto-dust setting." };
  }
}

export async function runSeasonEndAutoDustAction(league: CardLeague): Promise<{ ok: true; result: SeasonEndAutoDustResult } | { ok: false; error: string }> {
  if (!validLeague(league)) return { ok: false, error: "Invalid league." };
  const user = await member();
  if ("error" in user) return { ok: false, error: user.error };
  try {
    const result = await runSeasonEndAutoDust(createBettingServiceClient(), user.discordId, league);
    revalidatePath(league === "academy" ? "/academy/cards/collection" : "/cards/collection");
    return { ok: true, result };
  } catch (error) {
    console.error("season-end: auto-dust run failed", error);
    return { ok: false, error: "Could not dust Season's End duplicates." };
  }
}
