/**
 * Weekly card drop: posts the player-card movers to Discord and refreshes
 * the card_snapshots table that movement is measured against.
 *
 * Run: npx tsx scripts/weekly-card-drop.ts
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY; DISCORD_CARDS_WEBHOOK_URL
 * is optional — without it the snapshot still refreshes (first run seeds
 * the baseline silently), the post is just skipped. SITE_ORIGIN (optional)
 * turns names into card links.
 *
 * Scheduled by .github/workflows/weekly-card-drop.yml after Monday night's
 * games have been ingested, mirroring the weekly-brief jobs.
 */
import { createClient } from "@supabase/supabase-js";
import { fetchSeasonCards } from "../src/lib/cards/queries";
import type { PlayerCardData } from "../src/lib/cards/build";

interface SnapshotRow {
  slug: string;
  overall: number;
  tier: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function moverLine(card: PlayerCardData, previous: SnapshotRow, origin: string | null): string {
  const delta = card.overall - previous.overall;
  const arrow = delta > 0 ? "▲" : "▼";
  const name = origin ? `[${card.name}](${origin}/card/${card.slug})` : `**${card.name}**`;
  const tierNote = previous.tier !== card.tier.label ? ` · ${previous.tier.toUpperCase()} → ${card.tier.label.toUpperCase()}` : "";
  return `${name} ${previous.overall} → ${card.overall} (${arrow}${Math.abs(delta)})${tierNote}`;
}

async function main(): Promise<void> {
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const webhookUrl = process.env.DISCORD_CARDS_WEBHOOK_URL ?? null;
  const origin = process.env.SITE_ORIGIN?.replace(/\/$/, "") ?? null;

  const { data: settings, error: settingsError } = await supabase
    .from("league_settings")
    .select("current_season")
    .eq("id", 1)
    .single();
  if (settingsError) throw settingsError;
  const season = (settings as { current_season: string | null }).current_season;
  if (!season) throw new Error("league_settings.current_season is not set");

  const cards = await fetchSeasonCards(supabase, season);
  console.log(`Built ${cards.length} cards for season ${season}.`);

  const { data: snapshotRows, error: snapshotError } = await supabase
    .from("card_snapshots")
    .select("slug, overall, tier")
    .eq("season", season);
  if (snapshotError) throw snapshotError;
  const snapshots = new Map(((snapshotRows as SnapshotRow[]) ?? []).map((row) => [row.slug, row]));

  const movers = cards
    .map((card) => ({ card, previous: snapshots.get(card.slug) ?? null }))
    .filter((entry): entry is { card: PlayerCardData; previous: SnapshotRow } =>
      entry.previous !== null && entry.previous.overall !== entry.card.overall)
    .sort((a, b) => Math.abs(b.card.overall - b.previous.overall) - Math.abs(a.card.overall - a.previous.overall));
  const tierUps = movers.filter(
    ({ card, previous }) => card.overall > previous.overall && previous.tier !== card.tier.label,
  );
  const newcomers = cards.filter((card) => !snapshots.has(card.slug));

  // Manual runs (workflow_dispatch) can force a showcase post so the
  // webhook can be seen working without waiting a week for movement; a
  // fresh baseline (true first run) debuts the collection the same way.
  const showcase = process.env.SHOWCASE === "true" || snapshots.size === 0;

  if (!webhookUrl) {
    console.log("DISCORD_CARDS_WEBHOOK_URL not set — skipping the post.");
  } else if ((movers.length === 0 && newcomers.length === 0) || showcase) {
    if (!showcase) {
      console.log("No card movement since the last drop — nothing to post.");
    } else {
      const top = cards.slice(0, 8);
      const tierCounts = new Map<string, number>();
      for (const card of cards) tierCounts.set(card.tier.label, (tierCounts.get(card.tier.label) ?? 0) + 1);
      const lines = [
        "**Top of the collection**",
        ...top.map((card) => {
          const name = origin ? `[${card.name}](${origin}/card/${card.slug})` : `**${card.name}**`;
          return `${name} — ${card.overall} OVR ${card.tier.label} · ${card.archetype}`;
        }),
        "",
        [...tierCounts.entries()].map(([tier, count]) => `${tier}: ${count}`).join(" · "),
      ];
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [
            {
              title: `🃏 Player card collection — Season ${season}`,
              description: lines.join("\n").slice(0, 4000),
              color: 0xf5b62e,
              footer: { text: origin ? `${origin}/cards` : "FPL player cards" },
            },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`Discord webhook failed: HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
      }
      console.log(`Posted the collection showcase (${cards.length} cards).`);
    }
  } else {
    const lines: string[] = [];
    if (tierUps.length > 0) {
      lines.push("**Tier ups** 🎉", ...tierUps.slice(0, 5).map(({ card, previous }) => moverLine(card, previous, origin)), "");
    }
    const biggest = movers.filter((entry) => !tierUps.includes(entry)).slice(0, 8);
    if (biggest.length > 0) {
      lines.push("**Biggest movers**", ...biggest.map(({ card, previous }) => moverLine(card, previous, origin)));
    }
    if (newcomers.length > 0) {
      lines.push("", `**New cards**: ${newcomers.map((card) => `${card.name} (${card.overall})`).join(", ")}`);
    }
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: `📈 Weekly card drop — Season ${season}`,
            description: lines.join("\n").slice(0, 4000),
            color: 0xf5b62e,
            footer: { text: origin ? `${origin}/cards` : "FPL player cards" },
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`Discord webhook failed: HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    console.log(`Posted: ${tierUps.length} tier ups, ${movers.length} movers, ${newcomers.length} new cards.`);
  }

  const { error: upsertError } = await supabase.from("card_snapshots").upsert(
    cards.map((card) => ({
      season,
      slug: card.slug,
      overall: card.overall,
      tier: card.tier.label,
      taken_at: new Date().toISOString(),
    })),
    { onConflict: "season,slug" },
  );
  if (upsertError) throw upsertError;
  console.log(`Snapshot refreshed for ${cards.length} cards.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
