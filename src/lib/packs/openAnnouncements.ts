// Pack news for the Discord cards channel: every announcement a pull can
// trigger, queued with after() once the mint has committed. Best effort by
// contract — nothing here may fail or delay a pack. Split out of open.ts.

import "server-only";
import { after } from "next/server";
import type { createBettingServiceClient } from "@/lib/betting/service-client";
import type { PlayerCardData } from "@/lib/cards/build";
import type { OnAirMark } from "@/lib/cards/onAir";
import { dribbLabel } from "@/lib/cards/dribb";
import type { CardLeague } from "@/lib/cards/queries";
import { cardImageUrl, copyImageUrl } from "@/lib/cards/shareImage";
import { parallelLabelFor } from "@/lib/cards/skinLines";
import { siteUrl } from "@/lib/site/url";
import { GOLD, LIVE_RED, postCardsWebhook } from "./announce";
import { ECLIPSE_FOIL_TYPE, FOIL_TYPE_LABELS, foilTypeOf } from "./config";
import type { EclipsePrint } from "./eclipse";
import { secretSerialLabel } from "./rarities";
import { PackOpenTiming } from "./timing";
import { editionLabel } from "./week";

/** Announcement garnish is deliberately outside the pack transaction. A
 * profile read can be unavailable while the card mint is healthy, and the
 * webhook helper is best-effort by contract; neither failure may turn a
 * successful opening into an error. */
async function announcementCollectorName(
  service: ReturnType<typeof createBettingServiceClient>,
  discordId: string,
): Promise<string> {
  try {
    const { data } = await service
      .from("betting_profiles")
      .select("username, patron_until")
      .eq("discord_id", discordId)
      .maybeSingle();
    const row = data as { username?: string; patron_until?: string | null } | null;
    const burning = Boolean(row?.patron_until && new Date(row.patron_until).getTime() > Date.now());
    return `${burning ? "🔥 " : ""}${row?.username ?? "Someone"}`;
  } catch {
    return "Someone";
  }
}

/** Keep every pack announcement soft even if a caller replaces the shared
 * delivery helper with one that rejects instead of swallowing its failure. */
async function postPackAnnouncement(embed: Parameters<typeof postCardsWebhook>[0]): Promise<void> {
  try {
    await postCardsWebhook(embed);
  } catch {
    // Garnish, by contract.
  }
}

/**
 * Register committed pack news after all mint/chase writes complete. The
 * callback owns its profile reads and network work, so neither can extend the
 * Server Action response. Snapshotting prevents a later print mutation from
 * altering a message that has already been queued. `after()` may be nested,
 * which keeps this safe for the Discord /rip handler's existing callback.
 */
export function schedulePackAnnouncements({
  service,
  discordId,
  prints,
  stampedWeek,
  league,
  editionWeek,
  openingId,
  chase,
}: {
  service: ReturnType<typeof createBettingServiceClient>;
  discordId: string;
  prints: EclipsePrint[];
  stampedWeek: string;
  league: CardLeague;
  editionWeek: string | null;
  openingId: string;
  chase: { title: string; bounty: number } | null;
}): void {
  const queuedPrints = structuredClone(prints);
  after(async () => {
    const timing = new PackOpenTiming(openingId, "announcement");
    try {
      await timing.measure("delivery", async () => {
        const eclipsePrint = queuedPrints.find((print) => print.foilType === ECLIPSE_FOIL_TYPE);
        if (eclipsePrint) await announceEclipseClaim(service, discordId, eclipsePrint, stampedWeek, league);

        const secretPrint = queuedPrints.find((print) => print.card.secret);
        if (secretPrint) await announceSecretClaim(service, discordId, secretPrint, stampedWeek, league);

        // Signed Secrets and Eclipses already carry their autograph in the
        // message above. Every other signed copy gets its own line.
        for (const print of queuedPrints) {
          if (print.signed !== true || print.card.secret || print.foilType === ECLIPSE_FOIL_TYPE) continue;
          await announceSignatureClaim(service, discordId, print, stampedWeek, league);
        }

        const dribbPrint = queuedPrints.find((print) => print.card.dribb);
        if (dribbPrint?.card.dribb) await announceDribbClaim(service, discordId, dribbPrint.card.dribb, league);

        const onAirPrint = queuedPrints.find((print) => print.card.onAir);
        if (onAirPrint?.card.onAir) await announceOnAirClaim(service, discordId, onAirPrint.card.onAir, league);

        if (editionWeek && chase) {
          const chasePrint = queuedPrints.find((print) => print.card.chase?.title === chase.title);
          if (chasePrint) {
            await announceChaseClaim(service, discordId, chase.title, chasePrint, chase.bounty, editionWeek);
          }
        }
      });
      timing.log("ok");
    } catch {
      // Announcements are best effort. A runtime failure here must not affect
      // a committed pack; avoid logging the account, payload, or destination.
      console.error("packs: deferred announcement failed", { openingId });
      timing.log("error");
    }
  });
}

export function hasPackAnnouncement(prints: EclipsePrint[], chase: { title: string; bounty: number } | null): boolean {
  return chase !== null || prints.some((print) =>
    print.signed === true || print.card.secret || print.card.dribb || print.card.onAir || print.foilType === ECLIPSE_FOIL_TYPE,
  );
}

export function scheduleChampionSignatureAnnouncement({
  service,
  discordId,
  print,
  inventoryId,
  openingId,
}: {
  service: ReturnType<typeof createBettingServiceClient>;
  discordId: string;
  print: { card: PlayerCardData; foil: boolean; foilType: string | null; signed: boolean };
  inventoryId: number;
  openingId: string;
}): void {
  after(async () => {
    const timing = new PackOpenTiming(openingId, "announcement");
    try {
      await timing.measure("delivery", () => announceChampionSignatureClaim(service, discordId, print, inventoryId, "premier"));
      timing.log("ok");
    } catch {
      console.error("packs: deferred announcement failed", { openingId });
      timing.log("error");
    }
  });
}

/**
 * Tells the cards channel a one-of-one has been found.
 *
 * Best-effort like every announcement here: postCardsWebhook swallows its
 * own failures, so a Discord outage can never fail a pack that already
 * minted the rarest card in the game. The image URL carries the edition
 * week, both so it pictures THAT week's print and so Discord's cache
 * cannot serve a stale render under it.
 */
async function announceEclipseClaim(
  service: ReturnType<typeof createBettingServiceClient>,
  discordId: string,
  print: { card: PlayerCardData; signed: boolean },
  editionWeek: string,
  league: CardLeague,
): Promise<void> {
  const who = await announcementCollectorName(service, discordId);
  const { card } = print;
  const site = siteUrl();
  // Where the news goes next. An Eclipse falling is the one moment people
  // ask "what else is out there" — the Vault is the answer, and it is the
  // league's OWN register, so the announcement points at it rather than
  // leaving the question in the channel. The league picks the path: an
  // academy pull belongs on the academy board, and sending a reader to the
  // premier one would show them a card nobody in that message owns.
  const vaultUrl = site ? `${site}${league === "academy" ? "/academy/cards/vault" : "/cards/vault"}` : "";
  await postPackAnnouncement({
    title: "🌑 AN ECLIPSE HAS BEEN FOUND",
    description:
      `**${who}** pulled the one and only **${card.name}** — ${editionLabel(editionWeek)} edition.
` +
      `${card.overall} OVR · ${card.tier.label} ${card.role}${print.signed ? " · ✍️ Signed" : ""}

` +
      `One of one. Nobody else will ever own this card.` +
      (vaultUrl ? `\n[The Vault](${vaultUrl}) — every one found, and every one still out there.` : ""),
    color: GOLD,
    ...(site ? { image: { url: cardImageUrl(site, card.slug, editionWeek) } } : {}),
  });
}

/** The Dribb card landing. Points at the rarities page, which says what
 *  it is and how many are left; no card image, because the render route
 *  draws real players and Dribb is not one. */
async function announceDribbClaim(
  service: ReturnType<typeof createBettingServiceClient>,
  discordId: string,
  dribb: { number: number; of: number },
  league: CardLeague,
): Promise<void> {
  const who = await announcementCollectorName(service, discordId);
  const site = siteUrl();
  const raritiesUrl = site ? `${site}${league === "academy" ? "/academy/cards/rarities" : "/cards/rarities"}` : "";
  const left = dribb.of - dribb.number;
  await postPackAnnouncement({
    title: "✦ THE DRIBB CARD HAS BEEN FOUND",
    description:
      `**${who}** pulled **Dribb #${String(dribb.number).padStart(3, "0")}/${dribb.of}** — ${dribbLabel(dribb)}.\n` +
      `99 overall, a 99 in every column, on Bard. It cannot be dusted.\n\n` +
      (left > 0 ? `${left} of ${dribb.of} still out there, at one in ten thousand packs.` : `That was the last one. There will never be another.`) +
      (raritiesUrl ? `\n[What it is](${raritiesUrl})` : ""),
    color: 0xd27dff,
  });
}

/** An On Air card landing. Not a secret like the Dribb, so this is news the
 *  channel is meant to act on: it names the window it was pulled in and how
 *  many of the caster's twenty-five are left, and points at the rarities
 *  page, which lists it. No card image — the render route draws players, and
 *  a caster is not one. */
async function announceOnAirClaim(
  service: ReturnType<typeof createBettingServiceClient>,
  discordId: string,
  onAir: OnAirMark,
  league: CardLeague,
): Promise<void> {
  const who = await announcementCollectorName(service, discordId);
  const site = siteUrl();
  const raritiesUrl = site ? `${site}${league === "academy" ? "/academy/cards/rarities" : "/cards/rarities"}` : "";
  const left = onAir.of - onAir.number;
  await postPackAnnouncement({
    title: `🔴 ON AIR — ${onAir.name} is in a pack`,
    description:
      `**${who}** pulled **${onAir.name} #${String(onAir.number).padStart(3, "0")}/${onAir.of}** during **${onAir.window}**.\n` +
      `The casters only print while the stream is live. It cannot be dusted.\n` +
      `${left} of ${onAir.of} left this season.` +
      (raritiesUrl ? `\n[What it is](${raritiesUrl})` : ""),
    color: LIVE_RED,
  });
}

/** A Secret landing: the print numbered past the checklist. Points at the
 *  rarities page, because "what is that number" is the question it
 *  raises, and that page is the answer. */
async function announceSecretClaim(
  service: ReturnType<typeof createBettingServiceClient>,
  discordId: string,
  print: { card: PlayerCardData; foil: boolean; foilType: string | null; signed: boolean },
  editionWeek: string,
  league: CardLeague,
): Promise<void> {
  const who = await announcementCollectorName(service, discordId);
  const { card } = print;
  const site = siteUrl();
  const raritiesUrl = site ? `${site}${league === "academy" ? "/academy/cards/rarities" : "/cards/rarities"}` : "";
  const traits = [
    `${card.tier.label} ${card.role}`,
    ...(print.foil ? [`✨ ${parallelLabelFor(card.season, foilTypeOf(print.foilType), FOIL_TYPE_LABELS[foilTypeOf(print.foilType)])}`] : []),
    ...(card.shiny ? ["★ Shiny"] : []),
    ...(print.signed ? ["✍️ Signed"] : []),
  ].join(" · ");
  await postPackAnnouncement({
    title: "🔒 A SECRET HAS BEEN FOUND",
    description:
      `**${who}** pulled **${card.name} ${card.secret ? secretSerialLabel(card.secret) : ""}** — ${editionLabel(editionWeek)} edition.\n` +
      `${card.overall} OVR · ${traits}\n\n` +
      `A print numbered past the checklist. It was never on the list.` +
      (raritiesUrl ? `\n[Every rarity a card can pull](${raritiesUrl})` : ""),
    color: GOLD,
    ...(site ? { image: { url: cardImageUrl(site, card.slug, editionWeek) } } : {}),
  });
}

/** A signed player-card landing. This is separate from Secret/Eclipse news:
 * those announcements already include their autograph, while ordinary
 * signed pulls need one announcement per copy, including duplicate players.
 */
async function announceSignatureClaim(
  service: ReturnType<typeof createBettingServiceClient>,
  discordId: string,
  print: { card: PlayerCardData; foil: boolean; foilType: string | null; signed: boolean },
  editionWeek: string,
  league: CardLeague,
): Promise<void> {
  const who = await announcementCollectorName(service, discordId);
  const { card } = print;
  const site = siteUrl();
  const raritiesUrl = site ? `${site}${league === "academy" ? "/academy/cards/rarities" : "/cards/rarities"}` : "";
  const traits = [
    `${card.tier.label} ${card.role}`,
    ...(print.foil ? [`✨ ${parallelLabelFor(card.season, foilTypeOf(print.foilType), FOIL_TYPE_LABELS[foilTypeOf(print.foilType)])}`] : []),
    ...(card.shiny ? ["★ Shiny"] : []),
    "✍️ Signed",
  ].join(" · ");
  await postPackAnnouncement({
    title: "✍️ A SIGNATURE HAS BEEN PULLED",
    description:
      `**${who}** pulled a signed **${card.name}** — ${editionLabel(editionWeek)} edition.\n` +
      `${card.overall} OVR · ${traits}\n\n` +
      `A real autograph, frozen into this copy forever.` +
      (raritiesUrl ? `\n[Every rarity a card can pull](${raritiesUrl})` : ""),
    color: GOLD,
    ...(site ? { image: { url: cardImageUrl(site, card.slug, editionWeek) } } : {}),
  });
}

/**
 * Tells the Discord cards channel a chase fell. Best-effort via
 * postCardsWebhook: the claim and the bounty are already committed, and an
 * outage must not fail a pack someone just won something out of.
 */
async function announceChaseClaim(
  service: ReturnType<typeof createBettingServiceClient>,
  discordId: string,
  title: string,
  print: { card: PlayerCardData; foil: boolean; foilType: string | null; signed: boolean },
  bounty: number,
  editionWeek: string | null,
): Promise<void> {
  // Patrons carry the flame into the announcement too — the perk is being
  // seen, and this embed is the most-seen line the cards channel has.
  const who = await announcementCollectorName(service, discordId);
  const { card } = print;
  // Spell out what the winning pull actually WAS. The share image can't
  // show foil or ink, so without this line a subtle Prisma claim reads as
  // "that card isn't even foil" to everyone watching the channel.
  const traits = [
    `${card.tier.label} ${card.role}`,
    ...(print.foil ? [`✨ ${parallelLabelFor(card.season, foilTypeOf(print.foilType), FOIL_TYPE_LABELS[foilTypeOf(print.foilType)])}`] : []),
    ...(print.signed ? ["✍️ Signed"] : []),
  ].join(" · ");
  // The card itself rides the embed, via the share renderer the site
  // already serves. SITE_URL missing just drops the picture, not the news.
  const site = siteUrl();
  await postPackAnnouncement({
    title: "🏆 The chase has fallen",
    description: `**${who}** pulled it: ${title}\n${card.name} — ${card.overall} OVR · ${traits}${bounty > 0 ? `\nBounty: **+${bounty}**` : ""}`,
    color: GOLD,
    ...(site ? { image: { url: cardImageUrl(site, card.slug, editionWeek) } } : {}),
  });
}

/** A signed Faceless relic landing. Relics are live mints, not weekly
 * editions, and their rating fields are placeholders, so this wording names
 * the Hand and its foil without inventing an OVR or an edition. */
async function announceChampionSignatureClaim(
  service: ReturnType<typeof createBettingServiceClient>,
  discordId: string,
  print: { card: PlayerCardData; foil: boolean; foilType: string | null; signed: boolean },
  inventoryId: number,
  league: CardLeague,
): Promise<void> {
  const who = await announcementCollectorName(service, discordId);
  const { card } = print;
  const hand = card.champWin;
  const site = siteUrl();
  const raritiesUrl = site ? `${site}${league === "academy" ? "/academy/cards/rarities" : "/cards/rarities"}` : "";
  const traits = [
    `${card.tier.label} relic`,
    ...(hand ? [`${hand.team} · The Hand ${hand.setIndex} of ${hand.setSize}`] : []),
    ...(print.foil ? [`✨ ${parallelLabelFor(card.season, foilTypeOf(print.foilType), FOIL_TYPE_LABELS[foilTypeOf(print.foilType)])}`] : []),
    "✍️ Signed",
  ].join(" · ");
  await postPackAnnouncement({
    title: "✍️ A SIGNATURE HAS BEEN PULLED",
    description:
      `**${who}** pulled a signed Faceless relic: **${card.name}**${hand ? ` — ${hand.champion}` : ""}.\n` +
      `${traits}\n\n` +
      `Real ink from the champion's title-winning hand.` +
      (raritiesUrl ? `\n[Every rarity a card can pull](${raritiesUrl})` : ""),
    color: GOLD,
    ...(site ? { image: { url: copyImageUrl(site, { id: inventoryId }) } } : {}),
  });
}
