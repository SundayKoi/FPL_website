// The /flex command — one card out of your collection, in the channel.
//
// /rip is the moment a card arrives; this is every moment after it. The
// picture is the COPY (/copy/{id}/card.png), not the player's card, because
// the whole reason to show a card off is the things only that copy has: its
// parallel, its ink, its stamp in the print run. A picture that flattened a
// Cracked Ice #3-of-9 into the same image as a matte common would take the
// brag out of the brag.
//
// Reads are real work — a collection read pages, and the print run is a
// second query — so this follows /rip's shape exactly: ACK with a deferred
// response inside Discord's 3-second window, then do the work in `after()`
// and post to the interaction's followup webhook.
//
// The flex itself is PUBLIC. Every refusal is ephemeral: owning nothing of
// the player you named is not something the channel needs told.
import "server-only";
import { after } from "next/server";
import { createBettingServiceClient } from "../service-client";
import { commandHandlers } from "./registry";
import type { DiscordInteraction } from "./registry";
import { BRAND, deferred, errMsg } from "./respond";
import type { DiscordEmbed } from "./respond";
import { ensureUser, requireMember, siteUrl } from "./shared";
import { TIER_COLORS } from "./tierColors";
import { resolveRipWeek } from "./rip";
import { fetchCardEditionWeeks, fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { fetchInventory, fetchPrintRuns, type InventoryRow } from "@/lib/packs/queries";
import { printRunKey } from "@/lib/packs/printRuns";
import { copyImageUrl } from "@/lib/cards/shareImage";
import { ECLIPSE_FOIL_TYPE, FOIL_TYPES, FOIL_TYPE_LABELS, foilTypeOf } from "@/lib/packs/config";
import { editionLabel } from "@/lib/packs/week";

const GUILD_ONLY_MSG = "Use this in the server.";

/** Discord's ephemeral message flag. A followup posted to the interaction
 *  webhook carries its own flags, so a public deferral can still answer
 *  with a message only the caller sees. */
const EPHEMERAL_FLAG = 64;

/** How many names an ambiguous match lists before it stops. Five is enough
 *  to recognise the one you meant and short enough to read at a glance. */
const AMBIGUOUS_LIMIT = 5;

const LEAGUE_LABELS: Record<CardLeague, string> = { premier: "Premier", academy: "Academy" };

/** What an expedition brought home, as a chip. Worst to best, matching
 *  MARK_RANK — a copy wears one mark at a time and it is the best it has
 *  earned. */
const MARK_LABELS: Record<string, string> = {
  trail: "Trail mark",
  sigil: "Sigil mark",
  legend: "Legend mark",
};

/**
 * How good a copy's parallel is, as a number the ranking can compare.
 *
 * Derived from FOIL_TYPES rather than written out, because FOIL_TYPES is
 * already the ladder: rollFoilType walks it and FOIL_TYPE_WEIGHTS is keyed
 * on it, so its order IS rarity ascending (prisma → aurora → refractor →
 * ice). A second hand-written ordering here would be a second thing to
 * remember when a parallel is added, and the one nobody would remember.
 *
 * A matte copy sits below every foil at -1. Eclipse is not on this ladder
 * at all — it is not a parallel that competes with Cracked Ice, it is the
 * one-of-one — so it wins a rung above, in the comparator.
 */
function parallelRank(row: InventoryRow): number {
  if (!row.foil) return -1;
  return (FOIL_TYPES as readonly string[]).indexOf(foilTypeOf(row.foilType));
}

function isEclipse(row: InventoryRow): boolean {
  return row.foilType === ECLIPSE_FOIL_TYPE;
}

/** The copy's parallel as words: its Eclipse, its foil's name, or Matte. */
function parallelLabel(row: InventoryRow): string {
  if (isEclipse(row)) return FOIL_TYPE_LABELS[ECLIPSE_FOIL_TYPE];
  return row.foil ? FOIL_TYPE_LABELS[foilTypeOf(row.foilType)] : "Matte";
}

/**
 * The copy to show off, out of every copy of that player the caller owns.
 *
 * The ladder, top down, and each rung only speaks when everything above it
 * ties:
 *
 *   1. Eclipse — the one-of-one outranks anything, signed or not.
 *   2. Signed — ink is a 1-in-100 roll, rarer than any parallel below ice.
 *   3. Parallel — ice > refractor > aurora > prisma > matte (parallelRank).
 *   4. Overall — same print, better card.
 *   5. Newest — the copy that arrived last, because the freshest pull is
 *      the one being flexed about.
 *
 * `id` breaks a final tie so the pick is stable: two copies out of the same
 * pack share `acquired_at` to the microsecond, and a flex that showed a
 * different one of them on every invocation would look like a bug.
 *
 * Pure and exported: the ranking is the feature, and it is worth testing
 * without a database in the room.
 */
export function bestCopy(rows: InventoryRow[]): InventoryRow | null {
  let best: InventoryRow | null = null;
  for (const row of rows) if (!best || outranks(row, best)) best = row;
  return best;
}

function outranks(candidate: InventoryRow, incumbent: InventoryRow): boolean {
  const order =
    Number(isEclipse(candidate)) - Number(isEclipse(incumbent)) ||
    Number(candidate.signed) - Number(incumbent.signed) ||
    parallelRank(candidate) - parallelRank(incumbent) ||
    candidate.overall - incumbent.overall ||
    compareAcquired(candidate, incumbent) ||
    candidate.id - incumbent.id;
  return order > 0;
}

/** Newest first. ISO-8601 timestamps out of Postgres compare correctly as
 *  strings, and a string compare cannot be knocked out by a value Date
 *  parses to NaN. */
function compareAcquired(a: InventoryRow, b: InventoryRow): number {
  if (a.acquiredAt === b.acquiredAt) return 0;
  return a.acquiredAt > b.acquiredAt ? 1 : -1;
}

/**
 * The copies a typed name means, or the names it could have meant.
 *
 * Substring, case-insensitive, because nobody types a full display name into
 * a slash command. An EXACT name always wins outright: a collection holding
 * both "Ash" and "Ashley" would otherwise make "ash" permanently ambiguous
 * and leave one of the two unflexable. Anything else matching more than one
 * player answers with the names rather than guessing, since guessing shows
 * the wrong card publicly.
 */
export function matchPlayer(rows: InventoryRow[], query: string): { rows: InventoryRow[] } | { names: string[] } {
  const needle = query.trim().toLowerCase();
  const hits = rows.filter((row) => row.playerName.toLowerCase().includes(needle));
  const exact = hits.filter((row) => row.playerName.toLowerCase() === needle);
  if (exact.length > 0) return { rows: exact };

  const names = new Map<string, string>();
  for (const row of hits) names.set(row.playerName.toLowerCase(), row.playerName);
  if (names.size > 1) return { names: [...names.values()] };
  return { rows: hits };
}

export interface FlexContext {
  username: string;
  /** Origin for the copy picture; "" suppresses the image, as in /rip. */
  site: string;
  /** Minted-to-date for this copy's print, or null when unknown. */
  printRun: number | null;
}

/**
 * One owned copy as a public embed: who is flexing what, the chips that say
 * which copy it is, and the picture of that exact copy.
 *
 * The chips are the copy's identity in reading order — edition, parallel,
 * ink, stamp, art, grade, and what it brought back from the field. A chip
 * only appears when it has something to say, so a plain common reads as a
 * short line rather than a row of "no"s.
 *
 * Pure and exported. Everything network-y stays in the handler.
 */
export function flexEmbed(row: InventoryRow, { username, site, printRun }: FlexContext): DiscordEmbed {
  const chips: string[] = [`${editionLabel(row.editionWeek)} edition`, `**${parallelLabel(row)}**`];
  if (row.signed) chips.push("✍️ **Signed**");
  // "of N" needs both halves: a stamp with no run size is a number nobody
  // can read, and a run size without the stamp belongs to another copy. A
  // copy minted before print numbering existed has neither, and says so by
  // saying nothing.
  if (row.printNumber != null) {
    chips.push(printRun ? `#${row.printNumber} of ${printRun}` : `#${row.printNumber}`);
  }
  if ((row.card?.artSkin ?? 0) > 0) chips.push("Alt art");
  chips.push(`${row.card?.tier?.label ?? row.tier} · ${row.overall} OVR`);
  const mark = row.card?.expedition?.mark;
  if (mark && MARK_LABELS[mark]) chips.push(MARK_LABELS[mark]);

  return {
    title: `${username} flexes ${row.playerName}`,
    description: chips.join(" · "),
    color: TIER_COLORS[row.card?.tier?.key ?? row.tier] ?? BRAND,
    // The mark rides the url as its cache key: a copy is frozen at mint
    // except for what an expedition stamps on it, and Discord's image proxy
    // caches by url forever. copyImageUrl owns that rule — never hand-build
    // this string.
    ...(site
      ? { image: { url: copyImageUrl(site, { id: row.id, expeditionMark: row.card?.expedition?.mark ?? null }) } }
      : {}),
  };
}

/** League option; defaults to premier, like /rip's. */
function leagueOf(interaction: DiscordInteraction): CardLeague {
  const options = (interaction.data?.options ?? []) as { name: string; value?: unknown }[];
  const raw = options.find((option) => option.name === "league")?.value;
  return raw === "academy" ? "academy" : "premier";
}

function stringOption(interaction: DiscordInteraction, name: string): string | null {
  const options = (interaction.data?.options ?? []) as { name: string; value?: unknown }[];
  const raw = options.find((option) => option.name === name)?.value;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/** An ephemeral refusal, in the followup shape the webhook takes. */
function refusal(message: string): object {
  return { content: `❌ ${message}`, flags: EPHEMERAL_FLAG };
}

async function handleFlex(interaction: DiscordInteraction): Promise<object> {
  const member = requireMember(interaction);
  if (!member) return errMsg(GUILD_ONLY_MSG);

  const service = createBettingServiceClient();
  await ensureUser(service, member);

  const league = leagueOf(interaction);
  const player = stringOption(interaction, "player") ?? "";
  const rawWeek = stringOption(interaction, "week");
  const username = member.global_name ?? member.username ?? "Someone";
  const followupUrl = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`;

  after(async () => {
    let body: object;
    try {
      body = await flexBody(service, {
        discordId: member.id,
        league,
        player,
        rawWeek,
        username,
      });
    } catch {
      // The deferral already showed "thinking…"; a silent stall would sit
      // there forever, so any crash still answers something.
      body = refusal("Something went wrong finding that card.");
    }
    await fetch(followupUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  });

  return deferred();
}

/** The whole read side of a flex, as one function: season, week, collection,
 *  match, pick, print run. Returns the followup body either way. */
async function flexBody(
  service: ReturnType<typeof createBettingServiceClient>,
  input: { discordId: string; league: CardLeague; player: string; rawWeek: string | null; username: string },
): Promise<object> {
  const { discordId, league, player, rawWeek, username } = input;
  const leagueLabel = LEAGUE_LABELS[league];

  const season = await fetchCardSeason(service, league);
  if (!season) return refusal(`${leagueLabel} cards aren't running yet.`);

  // Resolving the week costs a read of the archive, so only a typed option
  // pays for it — the bare flex looks at every copy the caller owns.
  let week: string | null = null;
  if (rawWeek) {
    const weeks = await fetchCardEditionWeeks(service, season);
    if (weeks.length === 0) return refusal("No editions are archived yet — there's nothing to pick a week from.");
    const resolved = resolveRipWeek(rawWeek, weeks);
    if ("error" in resolved) return refusal(resolved.error);
    week = resolved.week;
  }

  const owned = await fetchInventory(service, discordId, season);
  const pool = week ? owned.filter((row) => row.editionWeek === week) : owned;
  const match = matchPlayer(pool, player);
  if ("names" in match) {
    const listed = match.names.slice(0, AMBIGUOUS_LIMIT).join(", ");
    const more = match.names.length > AMBIGUOUS_LIMIT ? `, and ${match.names.length - AMBIGUOUS_LIMIT} more` : "";
    return refusal(`"${player}" matches ${listed}${more} — be more specific.`);
  }

  const row = bestCopy(match.rows);
  if (!row) {
    const fromWeek = week ? ` from the ${editionLabel(week)} edition` : "";
    return refusal(`You don't own a ${player} card in ${leagueLabel}${fromWeek}.`);
  }

  // One key, one lookup: the denominator is a garnish, and fetchPrintRuns
  // already knows how to page and how to fail quietly.
  const runs = await fetchPrintRuns(service, season, [{ editionWeek: row.editionWeek, slug: row.slug }]);
  const printRun = runs.get(printRunKey(row.editionWeek, row.slug)) ?? null;

  return { embeds: [flexEmbed(row, { username, site: siteUrl(), printRun })] };
}

commandHandlers.flex = handleFlex;
