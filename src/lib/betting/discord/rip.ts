// The /rip command — the Daily Rip, in the channel where the league lives.
//
// A pack open is real work: pool fetch, RPC, autograph pass, art
// validation with CDN probes, insert. That routinely outruns Discord's
// 3-second interaction deadline, so the handler ACKs with a deferred
// response immediately and does the open in `after()` — Next's
// post-response hook — then posts the result to the interaction's followup
// webhook. The deadline is for the ACK, not the answer.
//
// The reveal is deliberately PUBLIC (not ephemeral): a rip everyone can see
// is the point of doing it in Discord at all.
import "server-only";
import { after } from "next/server";
import { createBettingServiceClient } from "../service-client";
import { fmtPoints } from "../format";
import { openPackFor, type OpenPackResult } from "@/lib/packs/open";
import { FOIL_TYPE_LABELS, foilTypeOf } from "@/lib/packs/config";
import { commandHandlers } from "./registry";
import type { DiscordInteraction } from "./registry";
import { BRAND, GREEN, deferred, errMsg } from "./respond";
import type { DiscordEmbed } from "./respond";
import { ensureUser, requireMember, siteUrl } from "./shared";
import { fetchCardEditionWeeks, fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { editionLabel } from "@/lib/packs/week";

const GUILD_ONLY_MSG = "Use this in the server.";

const TIER_EMOJI: Record<string, string> = {
  bronze: "🟫",
  silver: "⬜",
  gold: "🟨",
  platinum: "🟦",
  emerald: "🟩",
  diamond: "💠",
  master: "🟪",
  grandmaster: "🟥",
  challenger: "👑",
};

/** Embed stripe per tier — the same ladder the site's tier styling walks,
 *  so a rip reads at a glance in the channel the way it does on the shelf. */
const TIER_COLORS: Record<string, number> = {
  bronze: 0xb08d57,
  silver: 0xc7ccd6,
  gold: 0xe8c14b,
  platinum: 0x35d0ba,
  emerald: 0x2ecc71,
  diamond: 0x6ea8ff,
  master: 0xa96fe3,
  grandmaster: 0xe04747,
  challenger: 0x9ee7ff,
};

/** One pull as an embed line: tier glyph, name, overall, and everything
 *  worth shouting about. */
function pullLine(pull: Extract<OpenPackResult, { ok: true }>["cards"][number]): string {
  const { card } = pull;
  const badges: string[] = [];
  if (card.moment) badges.push("🏆 **MOMENT**");
  if (pull.signed) badges.push("✍️ **SIGNED**");
  if (pull.foil) badges.push(`✨ ${FOIL_TYPE_LABELS[foilTypeOf(pull.foilType)]}`);
  const glyph = TIER_EMOJI[card.tier.key] ?? "▫️";
  const suffix = badges.length ? ` — ${badges.join(" · ")}` : "";
  return `${glyph} **${card.name}** ${card.overall} OVR${suffix}`;
}

/** One pull as its own embed: the line, the tier's color stripe, and the
 *  card itself via the share renderer. Moments have no /card page, so
 *  they keep their line and stripe but carry no picture.
 *
 *  The edition week rides the picture's URL, and it is load-bearing twice
 *  over. It makes the render the print that was actually pulled rather than
 *  the player's card as it stands today — and, because Discord's image proxy
 *  caches by URL, it stops a week-old render being served under this week's
 *  text, which is what it did while every rip pointed at the same string. */
function pullEmbed(
  pull: Extract<OpenPackResult, { ok: true }>["cards"][number],
  site: string,
  editionWeek: string | null,
): DiscordEmbed {
  const { card } = pull;
  const week = editionWeek ? `?w=${encodeURIComponent(editionWeek)}` : "";
  return {
    description: pullLine(pull),
    color: TIER_COLORS[card.tier.key] ?? BRAND,
    ...(site && !card.moment ? { image: { url: `${site}/card/${card.slug}/card.png${week}` } } : {}),
  };
}

/** The followup message body for a finished rip: a header embed, then
 *  every card as its own picture. One message, ≤6 embeds — under
 *  Discord's 10-embed cap with room to spare. Exported for tests —
 *  everything network-y stays in the handler. */
export function ripFollowup(result: OpenPackResult, username: string): { embeds: DiscordEmbed[] } | { content: string } {
  if (!result.ok) return { content: `❌ ${result.error}` };

  const best = [...result.cards].sort((a, b) => b.card.overall - a.card.overall)[0];
  const site = siteUrl();

  const streakNote =
    result.streak && result.streak > 1 ? ` · 🔥 ${result.streak}-day streak` : "";
  const bonusNote =
    result.streakBonus && result.streakBonus > 0
      ? `🎁 Streak bonus: **+${fmtPoints(result.streakBonus)}**`
      : "";

  const header: DiscordEmbed = {
    title: `${username}'s Daily Rip`,
    ...(bonusNote ? { description: bonusNote } : {}),
    color: best && (best.foil || best.signed || best.card.moment) ? GREEN : BRAND,
    footer: { text: `Free daily pack${streakNote}` },
  };
  return { embeds: [header, ...result.cards.map((pull) => pullEmbed(pull, site, result.editionWeek))] };
}

/** League option; defaults to premier — the daily is a ritual, not a menu. */
function leagueOf(interaction: DiscordInteraction): CardLeague {
  const options = (interaction.data?.options ?? []) as { name: string; value?: unknown }[];
  const raw = options.find((option) => option.name === "league")?.value;
  return raw === "academy" ? "academy" : "premier";
}

/** The raw `week` option, if one was typed. */
function weekOptionOf(interaction: DiscordInteraction): string | null {
  const options = (interaction.data?.options ?? []) as { name: string; value?: unknown }[];
  const raw = options.find((option) => option.name === "week")?.value;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/**
 * "1" / "2" / a Monday date -> the archived edition week it names, against
 * `weeks` as fetchCardEditionWeeks returns them (newest first). Week
 * numbers count up from the season's first archive — how players talk
 * about them, and how the pack shop labels its picker. A miss answers
 * with the menu, because "isn't available" without the list is a
 * guessing game. Exported for tests.
 */
export function resolveRipWeek(raw: string, weeks: string[]): { week: string } | { error: string } {
  if (weeks.length === 0) return { error: "No weeks are archived yet — rip again after the first weekly drop." };
  const ascending = [...weeks].sort();
  if (/^\d{1,3}$/.test(raw)) {
    const week = ascending[Number(raw) - 1];
    if (week) return { week };
  } else if (weeks.includes(raw)) {
    return { week: raw };
  }
  const menu = ascending.map((week, index) => `${index + 1} (${editionLabel(week)})`).join(", ");
  return { error: `That week isn't archived. Pick ${menu}, or its Monday as YYYY-MM-DD.` };
}

async function handleRip(interaction: DiscordInteraction): Promise<object> {
  const member = requireMember(interaction);
  if (!member) return errMsg(GUILD_ONLY_MSG);

  const service = createBettingServiceClient();
  await ensureUser(service, member);

  const league = leagueOf(interaction);
  const username = member.global_name ?? member.username ?? "Someone";
  const followupUrl = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`;

  const rawWeek = weekOptionOf(interaction);

  after(async () => {
    let body: object;
    try {
      // Resolving the week option costs two reads, so only a typed option
      // pays them; the bare ritual stays two-queries lighter and mints the
      // newest edition as it always has.
      let requestedWeek: string | undefined;
      if (rawWeek) {
        const season = await fetchCardSeason(service, league);
        const resolved = resolveRipWeek(rawWeek, season ? await fetchCardEditionWeeks(service, season) : []);
        if ("error" in resolved) {
          await fetch(followupUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content: `❌ ${resolved.error}` }),
          });
          return;
        }
        requestedWeek = resolved.week;
      }
      body = ripFollowup(await openPackFor(member.id, league, { daily: true, requestedWeek }), username);
    } catch {
      // The deferral already showed "thinking…"; a silent stall would sit
      // there forever, so any crash still answers something.
      body = { content: "❌ Something went wrong opening the pack." };
    }
    await fetch(followupUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  });

  return deferred();
}

commandHandlers.rip = handleRip;
