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
//
// Both text options autocomplete out of the caller's OWN collection. The
// first /flex shipped with a bare text box, which meant knowing a player's
// display name to the character and no way at all to pick which of your
// copies went — the handler chose. Now `player` offers the players you
// hold, and `copy` offers every copy you own of the one you picked, best
// first, each named by what makes it that copy. Autocomplete has no
// deferral: Discord wants the list back inside three seconds, so those
// handlers do one collection read and answer.
import "server-only";
import { after } from "next/server";
import { createBettingServiceClient } from "../service-client";
import { autocompleteHandlers, commandHandlers } from "./registry";
import type { DiscordInteraction } from "./registry";
import { AUTOCOMPLETE_LIMIT, BRAND, autocomplete, deferred, errMsg } from "./respond";
import type { AutocompleteChoice, DiscordEmbed } from "./respond";
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

/** The same ladder, as a sort: best copy first. What the copy picker lists. */
export function rankCopies(rows: InventoryRow[]): InventoryRow[] {
  return [...rows].sort((a, b) => (outranks(a, b) ? -1 : outranks(b, a) ? 1 : 0));
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
  // A pick from the autocomplete list arrives as the slug, which is exact
  // by construction — and unlike a name, two players cannot share one.
  const bySlug = rows.filter((row) => row.slug === needle);
  if (bySlug.length > 0) return { rows: bySlug };
  const hits = rows.filter((row) => row.playerName.toLowerCase().includes(needle));
  const exact = hits.filter((row) => row.playerName.toLowerCase() === needle);
  if (exact.length > 0) return { rows: exact };

  const names = new Map<string, string>();
  for (const row of hits) names.set(row.playerName.toLowerCase(), row.playerName);
  if (names.size > 1) return { names: [...names.values()] };
  return { rows: hits };
}

/**
 * One copy as a line in the picker — everything that tells it apart from
 * the caller's other copies of the same player, in the order the embed's
 * chips use, plain text because a choice name renders no markdown.
 *
 *   "Aug 24 · Cracked Ice · Signed · #7 · Alt art · Gold 87"
 *
 * Exported for the handler's text fallback: a value typed rather than picked
 * is matched against these same labels, so what you read is what you can
 * type.
 */
export function copyLabel(row: InventoryRow): string {
  const parts: string[] = [editionLabel(row.editionWeek), parallelLabel(row)];
  if (row.signed) parts.push("Signed");
  if (row.printNumber != null) parts.push(`#${row.printNumber}`);
  if ((row.card?.artSkin ?? 0) > 0) parts.push("Alt art");
  parts.push(`${row.card?.tier?.label ?? row.tier} ${row.overall}`);
  const mark = row.card?.expedition?.mark;
  if (mark && MARK_LABELS[mark]) parts.push(MARK_LABELS[mark]);
  return parts.join(" · ");
}

/**
 * The players in a collection, as picker choices: one per player, the ones
 * whose best copy ranks highest first, narrowed to what has been typed so
 * far. The value is the slug, so a pick never has to survive a second trip
 * through name matching.
 *
 * Best-copy order rather than alphabetical because the empty picker — the
 * one you see before typing — is the interesting one: it should open on
 * your Eclipse, not on whoever's name starts with A.
 */
export function playerChoices(rows: InventoryRow[], typed: string): AutocompleteChoice[] {
  const needle = typed.trim().toLowerCase();
  const best = new Map<string, InventoryRow>();
  for (const row of rows) {
    if (needle && !row.playerName.toLowerCase().includes(needle)) continue;
    const incumbent = best.get(row.slug);
    if (!incumbent || outranks(row, incumbent)) best.set(row.slug, row);
  }
  return rankCopies([...best.values()])
    .slice(0, AUTOCOMPLETE_LIMIT)
    .map((row) => ({ name: `${row.playerName} — ${copyLabel(row)}`, value: row.slug }));
}

/**
 * The copies the caller could flex, best first, as picker choices, narrowed
 * to what has been typed so far — matched against the label, so typing
 * "ice" or "signed" or "Aug 24" finds the copy without knowing its id. The
 * value is the inventory id: the one name a copy has that nothing else
 * shares.
 */
export function copyChoices(rows: InventoryRow[], typed: string): AutocompleteChoice[] {
  const needle = typed.trim().toLowerCase();
  return rankCopies(rows)
    .map((row) => ({ row, label: copyLabel(row) }))
    .filter(({ label }) => !needle || label.toLowerCase().includes(needle))
    .slice(0, AUTOCOMPLETE_LIMIT)
    .map(({ row, label }) => ({ name: `${row.playerName} · ${label}`, value: String(row.id) }));
}

/**
 * The copy a typed `copy` value means, out of the copies the player match
 * left. A pick from the list is an id and is taken as is; anything else is
 * matched against the labels the list showed. `null` when nothing fits;
 * `"ambiguous"` when more than one does — either way the handler refuses
 * rather than guessing, because a guess shows the wrong card in public.
 */
export function pickCopy(rows: InventoryRow[], value: string): InventoryRow | "ambiguous" | null {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const id = Number(trimmed);
    return rows.find((row) => row.id === id) ?? null;
  }
  const needle = trimmed.toLowerCase();
  const hits = rows.filter((row) => copyLabel(row).toLowerCase().includes(needle));
  if (hits.length === 1) return hits[0];
  return hits.length === 0 ? null : "ambiguous";
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

/** The option the caller is typing in right now, and what is in it so far.
 *  An autocomplete interaction marks exactly one option `focused`. */
function focusedOption(interaction: DiscordInteraction): { name: string; value: string } | null {
  const options = (interaction.data?.options ?? []) as { name: string; value?: unknown; focused?: boolean }[];
  const focused = options.find((option) => option.focused);
  if (!focused) return null;
  return { name: focused.name, value: typeof focused.value === "string" ? focused.value : "" };
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
  const copy = stringOption(interaction, "copy");
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
        copy,
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
  input: {
    discordId: string;
    league: CardLeague;
    player: string;
    copy: string | null;
    rawWeek: string | null;
    username: string;
  },
): Promise<object> {
  const { discordId, league, player, copy, rawWeek, username } = input;
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

  if (match.rows.length === 0) {
    const fromWeek = week ? ` from the ${editionLabel(week)} edition` : "";
    return refusal(`You don't own a ${player} card in ${leagueLabel}${fromWeek}.`);
  }

  // A chosen copy beats the ranking; no choice, and the best one goes. The
  // pick is scoped to the player's copies, so a stale id from another
  // player — or from a copy dusted since the picker showed it — is a
  // refusal, never someone else's card.
  let row: InventoryRow;
  if (copy) {
    const picked = pickCopy(match.rows, copy);
    if (picked === "ambiguous") return refusal(`"${copy}" fits more than one of your copies — pick one from the list.`);
    if (!picked) return refusal(`That isn't one of your ${match.rows[0].playerName} copies any more — pick again from the list.`);
    row = picked;
  } else {
    row = bestCopy(match.rows)!;
  }

  // One key, one lookup: the denominator is a garnish, and fetchPrintRuns
  // already knows how to page and how to fail quietly.
  const runs = await fetchPrintRuns(service, season, [{ editionWeek: row.editionWeek, slug: row.slug }]);
  const printRun = runs.get(printRunKey(row.editionWeek, row.slug)) ?? null;

  return { embeds: [flexEmbed(row, { username, site: siteUrl(), printRun })] };
}

/**
 * The picker behind both text options. One collection read, no wallet
 * provisioning (this fires per keystroke, and ensureUser is a write), and
 * every failure — no member, no season, a read that throws — is an empty
 * list: an autocomplete request can only be answered with choices, and the
 * command the caller eventually submits is where a refusal can explain
 * itself.
 */
async function handleFlexAutocomplete(interaction: DiscordInteraction): Promise<object> {
  const member = requireMember(interaction);
  const focused = focusedOption(interaction);
  if (!member || !focused) return autocomplete([]);

  try {
    const service = createBettingServiceClient();
    const league = leagueOf(interaction);
    const season = await fetchCardSeason(service, league);
    if (!season) return autocomplete([]);

    const owned = await fetchInventory(service, member.id, season);
    if (focused.name === "player") return autocomplete(playerChoices(owned, focused.value));
    if (focused.name !== "copy") return autocomplete([]);

    // The copy list is scoped to the player already chosen (or typed) and
    // the week, if any — the same narrowing the command itself will do, so
    // what the picker offers is exactly what a submit will accept. Before a
    // player is chosen, it is every copy the caller owns, best first, which
    // is a reasonable "what have I got worth showing" on its own.
    let pool = owned;
    const rawWeek = stringOption(interaction, "week");
    if (rawWeek) {
      const resolved = resolveRipWeek(rawWeek, await fetchCardEditionWeeks(service, season));
      if ("week" in resolved) pool = pool.filter((row) => row.editionWeek === resolved.week);
    }
    const player = stringOption(interaction, "player");
    if (player) {
      const match = matchPlayer(pool, player);
      pool = "rows" in match ? match.rows : pool.filter((row) => match.names.includes(row.playerName));
    }
    return autocomplete(copyChoices(pool, focused.value));
  } catch {
    return autocomplete([]);
  }
}

commandHandlers.flex = handleFlex;
autocompleteHandlers.flex = handleFlexAutocomplete;
