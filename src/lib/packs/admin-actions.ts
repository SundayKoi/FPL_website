"use server";

// Admin-only card actions: opening a Live Drops window and arming the
// Weekly Chase. Server actions rather than the client-write pattern the
// rest of the admin strip uses, for one reason — both ANNOUNCE to Discord,
// and the webhook URL is a server secret a browser write can never touch.
//
// Authorization is fetchStaffTier against the caller's own session; the
// service client only comes out after that says admin.

import { createServerSupabase } from "@/lib/supabase/server";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { revalidatePath } from "next/cache";
import { fetchCardEditionWeeks, fetchCardSeason } from "@/lib/cards/queries";
import { CHAMPIONS_PACK_COST } from "@/lib/cards/champions";
import { chaseCriteriaFromPreset, chaseRoleOf, type ChasePreset } from "./chase";
import { GOLD, LIVE_RED, postCardsWebhook } from "./announce";
import { editionLabel } from "./week";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { isAdmin } = await fetchStaffTier(supabase);
  return isAdmin;
}

async function requireOwner(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { isOwner } = await fetchStaffTier(supabase);
  return isOwner;
}

const LIVE_HOURS = [2, 3, 4] as const;

/**
 * Opens (or closes) the Live Drops window, and tells the channel. The
 * announcement is the half the old client-side write could never do —
 * a live window nobody hears about is just a quiet odds change.
 */
export async function setLiveWindowAction(
  input: { hours: number; label: string } | { end: true },
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Admins only." };
  const service = createBettingServiceClient();

  if ("end" in input) {
    const { error } = await service
      .from("league_settings")
      .update({ live_until: null, live_label: null })
      .eq("id", 1);
    if (error) return { ok: false, error: "Could not close the window." };
    revalidatePath("/schedule");
    revalidatePath("/cards/packs");
    return { ok: true };
  }

  if (!LIVE_HOURS.includes(input.hours as (typeof LIVE_HOURS)[number])) {
    return { ok: false, error: "Pick 2, 3 or 4 hours." };
  }
  const label = input.label.trim() || "Live drop";
  const until = new Date(Date.now() + input.hours * 60 * 60 * 1000);
  const { error } = await service
    .from("league_settings")
    .update({ live_until: until.toISOString(), live_label: label })
    .eq("id", 1);
  if (error) return { ok: false, error: "Could not open the window." };

  await postCardsWebhook({
    title: "🔴 LIVE DROPS are open",
    description: `**${label}** — for the next ${input.hours} hours every pack rolls boosted foil odds and every card is stamped LIVE.\nRip while the games run.`,
    color: LIVE_RED,
  });
  revalidatePath("/schedule");
  revalidatePath("/cards/packs");
  return { ok: true };
}

const CHAMPIONS_DAYS = [3, 5, 7] as const;

/**
 * Opens (or closes) the Faceless Drop window, and tells the channel.
 * OWNER-gated, not admin: a commemorative set is a league-history call,
 * and once the window closes the scarcity is meant to be permanent.
 */
export async function setChampionsWindowAction(
  input: { days: number } | { end: true },
): Promise<ActionResult> {
  if (!(await requireOwner())) return { ok: false, error: "Owners only." };
  const service = createBettingServiceClient();

  if ("end" in input) {
    const { error } = await service
      .from("league_settings")
      .update({ champions_until: null })
      .eq("id", 1);
    if (error) return { ok: false, error: "Could not close the drop." };
    revalidatePath("/schedule");
    revalidatePath("/cards/packs");
    return { ok: true };
  }

  if (!CHAMPIONS_DAYS.includes(input.days as (typeof CHAMPIONS_DAYS)[number])) {
    return { ok: false, error: "Pick 3, 5 or 7 days." };
  }
  const until = new Date(Date.now() + input.days * 24 * 60 * 60 * 1000);
  const { error } = await service
    .from("league_settings")
    .update({ champions_until: until.toISOString() })
    .eq("id", 1);
  if (error) return { ok: false, error: "Could not open the drop — is the champions migration applied?" };

  await postCardsWebhook({
    title: "🂡 THE FACELESS DROP IS LIVE",
    description:
      `Season Four's champions, printed as **The Hand** — K, A, Q, 7 and the Joker of spades, one card per pack. ` +
      `Boosted foil odds, real-ink autographs for the champions who can still sign, every copy serial-numbered.\n` +
      `**${CHAMPIONS_PACK_COST}** a pack, for **${input.days} days** — then the vault shuts and what was pulled is all there will ever be.`,
    color: LIVE_RED,
  });
  revalidatePath("/schedule");
  revalidatePath("/cards/packs");
  return { ok: true };
}

/**
 * Arms this week's chase and announces it.
 *
 * The week is ALWAYS the newest premier edition — the week packs mint by
 * default — never caller-supplied. The SQL path's one real foot-gun was
 * arming a week no pack was minting from, where the chase sat invisible
 * and unwinnable; deriving the week here removes the field entirely.
 */
export async function armChaseAction(input: {
  title: string;
  bounty: number;
  preset: ChasePreset;
  parameter?: string;
  /** Optional role the winning card must be printed with ("Jungle").
   *  ANDs onto the preset — "Any foil" + Jungle is a foil jungle card. */
  role?: string;
}): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Admins only." };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the chase a name people can repeat." };
  const bounty = Math.floor(input.bounty);
  if (!Number.isFinite(bounty) || bounty < 0 || bounty > 10000) {
    return { ok: false, error: "Bounty must be between 0 and 10,000." };
  }
  const criteria = chaseCriteriaFromPreset(input.preset, input.parameter);
  if (!criteria) return { ok: false, error: "That preset needs its detail filled in." };
  if (input.role !== undefined && input.role !== "") {
    const role = chaseRoleOf(input.role);
    if (!role) return { ok: false, error: "That role isn't one printed on cards." };
    criteria.role = role;
  }

  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, "premier");
  if (!season) return { ok: false, error: "No season is set up." };
  const weeks = await fetchCardEditionWeeks(service, season);
  const week = weeks[0];
  if (!week) return { ok: false, error: "No edition has been archived yet — run a weekly drop first." };

  const { error } = await service
    .from("card_chases")
    .insert({ season, week, title, bounty, criteria });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return { ok: false, error: `A chase is already armed for ${editionLabel(week)}.` };
    }
    return { ok: false, error: "Could not arm the chase." };
  }

  // A player-specific chase can show its target; the other presets have no
  // single card to picture.
  const site = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  await postCardsWebhook({
    title: "★ This week's chase is live",
    description: `**${title}**\nFirst to pull it${bounty > 0 ? ` wins **${bounty}** betting dollars and` : ""} takes the CHASE stamp — ${editionLabel(week)} packs only, premier or academy.`,
    color: GOLD,
    ...(site && criteria.slug ? { image: { url: `${site}/card/${criteria.slug}/card.png` } } : {}),
  });
  revalidatePath("/cards/packs");
  revalidatePath("/schedule");
  return { ok: true };
}
