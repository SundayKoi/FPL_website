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
import { chaseCriteriaFromPreset, chaseRoleOf, type ChasePreset } from "./chase";
import { GOLD, LIVE_RED, postCardsWebhook } from "./announce";
import { editionLabel } from "./week";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { isAdmin } = await fetchStaffTier(supabase);
  return isAdmin;
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
