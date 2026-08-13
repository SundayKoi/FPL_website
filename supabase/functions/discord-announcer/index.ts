// Discord announcer edge function — the Discord-posting half of the gateway
// bot's market/pick'em/season lifecycle loop (c:\fpl_gambling\bot\main.py's
// `lifecycle`/`ledger_watchdog` task loops), plus the hourly ledger-integrity
// watchdog. Deployed with verify-JWT disabled (this endpoint is never called
// through Supabase Auth — pg_cron hits it directly); it authenticates the
// caller itself via a shared secret header instead (see requireAnnouncerAuth
// below). Invoked every minute ({"job":"announce"}, the default) and hourly
// ({"job":"watchdog"}) by the pg_cron jobs in
// supabase/migrations/20260813000008_betting_announcer_cron.sql.
//
// The pure-SQL half of the old lifecycle loop (void one-sided markets, lock
// due markets/pick'ems, resolve ready pick'ems) already runs every minute as
// its own pg_cron job — betting_lifecycle_tick(), added by
// 20260813000005_betting_lifecycle_cron.sql. This function only drains the
// announcement queues that tick populates and posts to Discord.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// ---- embed colors: ported verbatim from main.py's BRAND/GREEN/RED, plus the
// amber "last call" color main.py inlines as 0xF0B232 -----------------------
const BRAND = 0x0e3050;
const GREEN = 0x34e98a;
const RED = 0xff5063;
const AMBER = 0xf0b232;

/** Points as the exchange's currency string — same formatting as
 * src/lib/betting/format.ts's fmtPoints (duplicated here since Deno edge
 * functions can't import from the Next app's src/ tree). */
function fmt(points: number): string {
  const sign = points < 0 ? "-" : "";
  return `${sign}$${Math.abs(points).toLocaleString("en-US")}`;
}

/** `<t:unix:style>` — Discord's client-rendered timestamp markup, same as
 * src/lib/betting/discord/commands.ts's discordTimestamp. */
function discordTimestamp(iso: string, style: "R" | "t"): string {
  return `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`;
}

function siteUrl(): string {
  return Deno.env.get("SITE_URL") ?? "";
}

/** Discord REST base URL — overridable for local testing (`supabase
 * functions serve` against a local echo server instead of the real API). */
function discordApiBase(): string {
  return Deno.env.get("DISCORD_API_BASE") ?? "https://discord.com/api/v10";
}

// deno-lint-ignore no-explicit-any
type DiscordEmbed = Record<string, any>;
// deno-lint-ignore no-explicit-any
type DiscordComponent = Record<string, any>;

/** Posts one message (embeds + optional components) to the configured
 * announce channel. Returns whether Discord accepted it (2xx) — callers only
 * mark an item announced after a true result, so a failed post naturally
 * retries next tick (at-least-once, matching the brief). Never throws: a
 * missing channel id/bot token or a network failure both resolve to false,
 * same as main.py's `except discord.HTTPException: pass` around the
 * lifecycle loop's channel.send calls. */
async function postMessage(embeds: DiscordEmbed[], components?: DiscordComponent[]): Promise<boolean> {
  const channelId = Deno.env.get("DISCORD_ANNOUNCE_CHANNEL_ID");
  const botToken = Deno.env.get("DISCORD_BOT_TOKEN");
  if (!channelId || !botToken) {
    console.error("discord-announcer: DISCORD_ANNOUNCE_CHANNEL_ID/DISCORD_BOT_TOKEN not configured");
    return false;
  }
  try {
    const res = await fetch(`${discordApiBase()}/channels/${channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ embeds, ...(components ? { components } : {}) }),
    });
    if (!res.ok) {
      console.error(`discord-announcer: post failed (${res.status})`, await res.text().catch(() => ""));
    }
    return res.ok;
  } catch (err) {
    console.error("discord-announcer: post threw", err);
    return false;
  }
}

// ---- bet-button action row: wire format MUST match the old gateway bot's
// BetButton exactly (bot/main.py) so pre-cutover announcement messages keep
// working — custom_id `bet:<marketId>:<teamId>:<code>` (teamId -1 = the
// draw). Button style 1 = primary, 5 = link. ---------------------------------

interface MarketQueueRow {
  id: number;
  title: string;
  team_a: string;
  team_b: string;
  game_at: string;
  lock_at: string;
  team_a_id: number;
  team_a_code: string;
  team_b_id: number;
  team_b_code: string;
  draw_enabled: boolean;
}

function betView(m: MarketQueueRow): DiscordComponent[] {
  const buttons: DiscordComponent[] = [
    { type: 2, style: 1, label: `Bet ${m.team_a_code}`, custom_id: `bet:${m.id}:${m.team_a_id}:${m.team_a_code}` },
  ];
  if (m.draw_enabled) {
    buttons.push({ type: 2, style: 1, label: "Bet DRAW", custom_id: `bet:${m.id}:-1:DRAW` });
  }
  buttons.push({ type: 2, style: 1, label: `Bet ${m.team_b_code}`, custom_id: `bet:${m.id}:${m.team_b_id}:${m.team_b_code}` });
  buttons.push({ type: 2, style: 5, label: "View market", url: `${siteUrl()}/betting/market/${m.id}` });
  return [{ type: 1, components: buttons }];
}

// ---- resolve_summary: winner + payout stats for a resolved market's
// announcement. No SQL RPC ports this (20260813000005's header note leaves
// it to this function) — reimplemented here as a couple of direct table
// reads against the service-role client, same shape as bot/service.py's
// resolve_summary. Draw-aware: for a drawn market the winning side is the
// draw backers (is_draw), not a team. -----------------------------------------

interface ResolveSummary {
  drawn: boolean;
  winnerName: string | null;
  pool: number;
  winners: number;
  topUsername: string | null;
  topProfit: number | null;
}

async function resolveSummary(supabase: SupabaseClient, m: MarketQueueRow): Promise<ResolveSummary> {
  const { data: marketRow } = await supabase
    .from("betting_markets")
    .select("drawn, winning_team_id")
    .eq("id", m.id)
    .maybeSingle();
  const drawn = Boolean((marketRow as { drawn: boolean } | null)?.drawn);
  const winningTeamId = (marketRow as { winning_team_id: number | null } | null)?.winning_team_id ?? null;
  const winnerName = drawn ? "Draw" : winningTeamId === m.team_a_id ? m.team_a : winningTeamId === m.team_b_id ? m.team_b : null;

  const { data: betsData } = await supabase
    .from("betting_bets")
    .select("discord_id, amount, payout, team_id, is_draw")
    .eq("market_id", m.id);
  const bets = (betsData ?? []) as {
    discord_id: string;
    amount: number;
    payout: number | null;
    team_id: number | null;
    is_draw: boolean;
  }[];

  let pool = 0;
  const winningBets: typeof bets = [];
  for (const b of bets) {
    pool += b.amount;
    const isWinner = drawn ? b.is_draw : b.team_id === winningTeamId;
    if (isWinner) winningBets.push(b);
  }

  let topUsername: string | null = null;
  let topProfit: number | null = null;
  if (winningBets.length > 0) {
    let top = winningBets[0];
    let topP = (top.payout ?? 0) - top.amount;
    for (const b of winningBets.slice(1)) {
      const p = (b.payout ?? 0) - b.amount;
      if (p > topP) {
        top = b;
        topP = p;
      }
    }
    if (topP > 0) {
      const { data: profile } = await supabase
        .from("betting_profiles")
        .select("username")
        .eq("discord_id", top.discord_id)
        .maybeSingle();
      topUsername = (profile as { username: string | null } | null)?.username ?? top.discord_id;
      topProfit = topP;
    }
  }

  return { drawn, winnerName, pool, winners: winningBets.length, topUsername, topProfit };
}

/** Port of main.py lifecycle's resolved-market description build, verbatim. */
function resolvedDescription(s: ResolveSummary): string {
  let desc = s.drawn ? "🤝 **It's a draw!**\n" : s.winnerName ? `**${s.winnerName}** takes it!\n` : "";
  if (s.winners > 0) {
    desc += `${s.winners} winner${s.winners !== 1 ? "s" : ""} split the **${fmt(s.pool)}** pool`;
    if (s.topUsername && (s.topProfit ?? 0) > 0) {
      desc += ` — biggest win: **${s.topUsername}** +${fmt(s.topProfit ?? 0)}`;
    }
  } else {
    desc += "Nobody backed the winning side — all stakes refunded.";
  }
  return desc;
}

// ---- announce job: drain every queue in order, per-item try/catch so one
// failed post never aborts the rest of the drain. Marks announced only after
// a true (2xx) postMessage result — at-least-once delivery; an unposted item
// is retried on the next minute's tick. ---------------------------------------

async function runAnnounce(supabase: SupabaseClient): Promise<number> {
  let posted = 0;

  // ---- open markets: bet-button action row ----
  const { data: openMarkets, error: openErr } = await supabase.rpc("unannounced_markets", { p_kind: "open" });
  if (openErr) console.error("discord-announcer: unannounced_markets(open) failed", openErr);
  for (const m of (openMarkets ?? []) as MarketQueueRow[]) {
    try {
      const embed: DiscordEmbed = {
        title: `🎰 Betting open — ${m.title}`,
        url: `${siteUrl()}/betting/market/${m.id}`,
        description: `**${m.team_a}** vs **${m.team_b}**\nGame ${discordTimestamp(m.game_at, "t")} · locks ${discordTimestamp(m.lock_at, "R")}`,
        color: BRAND,
        image: { url: `${siteUrl()}/api/betting/share/${m.id}/open` },
      };
      if (await postMessage([embed], betView(m))) {
        const { error } = await supabase.rpc("mark_announced", { p_market: m.id, p_kind: "open" });
        if (error) console.error("discord-announcer: mark_announced(open) failed", m.id, error);
        else posted++;
      }
    } catch (err) {
      console.error("discord-announcer: open-market announce failed", m.id, err);
    }
  }

  // ---- last call: markets locking soon ----
  const { data: locking, error: lockingErr } = await supabase.rpc("markets_locking_soon");
  if (lockingErr) console.error("discord-announcer: markets_locking_soon failed", lockingErr);
  for (const m of (locking ?? []) as { id: number; title: string; lock_at: string }[]) {
    try {
      const embed: DiscordEmbed = {
        title: `⏰ Last call — ${m.title}`,
        url: `${siteUrl()}/betting/market/${m.id}`,
        description: `Betting locks ${discordTimestamp(m.lock_at, "R")}. Get your bets in!`,
        color: AMBER,
      };
      if (await postMessage([embed])) {
        const { error } = await supabase.rpc("mark_announced", { p_market: m.id, p_kind: "lock_warn" });
        if (error) console.error("discord-announcer: mark_announced(lock_warn) failed", m.id, error);
        else posted++;
      }
    } catch (err) {
      console.error("discord-announcer: lock-warn announce failed", m.id, err);
    }
  }

  // ---- resolved markets ----
  const { data: resolvedMarkets, error: resolvedErr } = await supabase.rpc("unannounced_markets", { p_kind: "resolved" });
  if (resolvedErr) console.error("discord-announcer: unannounced_markets(resolved) failed", resolvedErr);
  for (const m of (resolvedMarkets ?? []) as MarketQueueRow[]) {
    try {
      const summary = await resolveSummary(supabase, m);
      const embed: DiscordEmbed = {
        title: `🏆 Resolved — ${m.title}`,
        url: `${siteUrl()}/betting/market/${m.id}`,
        description: resolvedDescription(summary),
        color: GREEN,
        image: { url: `${siteUrl()}/api/betting/share/${m.id}/result` },
      };
      if (await postMessage([embed])) {
        const { error } = await supabase.rpc("mark_announced", { p_market: m.id, p_kind: "resolved" });
        if (error) console.error("discord-announcer: mark_announced(resolved) failed", m.id, error);
        else posted++;
      }
    } catch (err) {
      console.error("discord-announcer: resolved-market announce failed", m.id, err);
    }
  }

  // ---- cancelled markets ----
  const { data: cancelledMarkets, error: cancelledErr } = await supabase.rpc("unannounced_markets", { p_kind: "cancelled" });
  if (cancelledErr) console.error("discord-announcer: unannounced_markets(cancelled) failed", cancelledErr);
  for (const m of (cancelledMarkets ?? []) as MarketQueueRow[]) {
    try {
      const embed: DiscordEmbed = {
        title: `↩️ Cancelled — ${m.title}`,
        description: "Match didn't happen — every stake was refunded.",
        color: RED,
      };
      if (await postMessage([embed])) {
        const { error } = await supabase.rpc("mark_announced", { p_market: m.id, p_kind: "cancelled" });
        if (error) console.error("discord-announcer: mark_announced(cancelled) failed", m.id, error);
        else posted++;
      }
    } catch (err) {
      console.error("discord-announcer: cancelled-market announce failed", m.id, err);
    }
  }

  // ---- pick'em: open ----
  const { data: openPickems, error: openPickemsErr } = await supabase.rpc("unannounced_pickems", { p_which: "open" });
  if (openPickemsErr) console.error("discord-announcer: unannounced_pickems(open) failed", openPickemsErr);
  for (const p of (openPickems ?? []) as { id: number; title: string; carryover: number; lock_at: string; legs: number }[]) {
    try {
      const jackpot = p.carryover ? `\n💰 **${fmt(p.carryover)} JACKPOT carried over!**` : "";
      const embed: DiscordEmbed = {
        title: `🃏 Pick'em open — ${p.title}`,
        url: `${siteUrl()}/betting`,
        description:
          `Call the winner of all **${p.legs} series** tonight — perfect cards split the pool.` +
          `${jackpot}\nLocks ${discordTimestamp(p.lock_at, "R")}`,
        color: BRAND,
      };
      if (await postMessage([embed])) {
        const { error } = await supabase.rpc("mark_pickem_announced", { p_pickem: p.id, p_which: "open" });
        if (error) console.error("discord-announcer: mark_pickem_announced(open) failed", p.id, error);
        else posted++;
      }
    } catch (err) {
      console.error("discord-announcer: pickem-open announce failed", p.id, err);
    }
  }

  // ---- pick'em: done (resolved or cancelled) ----
  const { data: donePickems, error: donePickemsErr } = await supabase.rpc("unannounced_pickems", { p_which: "done" });
  if (donePickemsErr) console.error("discord-announcer: unannounced_pickems(done) failed", donePickemsErr);
  for (const p of (donePickems ?? []) as { id: number; title: string; status: string }[]) {
    try {
      let embed: DiscordEmbed;
      if (p.status === "CANCELLED") {
        embed = {
          title: `↩️ Pick'em cancelled — ${p.title}`,
          description: "All cards refunded.",
          color: RED,
        };
      } else {
        const { data: summaryRows, error: summaryErr } = await supabase.rpc("pickem_summary", { p_pickem: p.id });
        if (summaryErr) throw new Error(summaryErr.message);
        const s = (Array.isArray(summaryRows) ? summaryRows[0] : summaryRows) as {
          pool: number;
          winners: number;
          top_username: string | null;
          top_payout: number | null;
        };
        let desc: string;
        if (s.winners > 0) {
          desc = `${s.winners} perfect card${s.winners !== 1 ? "s" : ""} split the **${fmt(s.pool)}** pool`;
          if (s.top_username) desc += ` — top card: **${s.top_username}** ${fmt(s.top_payout ?? 0)}`;
        } else {
          desc = `Nobody went perfect — the **${fmt(s.pool)}** pool **ROLLS OVER** to the next Pick'em! 💰`;
        }
        const { data: nearData, error: nearErr } = await supabase.rpc("pickem_near_misses", { p_pickem: p.id });
        if (nearErr) console.error("discord-announcer: pickem_near_misses failed", p.id, nearErr);
        const near = (nearData ?? []) as string[];
        if (near.length > 0) {
          desc += `\n\n😤 So close (one off): ${near.map((n) => `**${n}**`).join(", ")}`;
        }
        embed = {
          title: `🃏 Pick'em results — ${p.title}`,
          url: `${siteUrl()}/betting`,
          description: desc,
          color: GREEN,
        };
      }
      if (await postMessage([embed])) {
        const { error } = await supabase.rpc("mark_pickem_announced", { p_pickem: p.id, p_which: "done" });
        if (error) console.error("discord-announcer: mark_pickem_announced(done) failed", p.id, error);
        else posted++;
      }
    } catch (err) {
      console.error("discord-announcer: pickem-done announce failed", p.id, err);
    }
  }

  // ---- season close ----
  const { data: closedSeasons, error: closedSeasonsErr } = await supabase.rpc("unannounced_closed_seasons");
  if (closedSeasonsErr) console.error("discord-announcer: unannounced_closed_seasons failed", closedSeasonsErr);
  for (const s of (closedSeasons ?? []) as { id: number; name: string }[]) {
    try {
      const { data: podiumData, error: podiumErr } = await supabase.rpc("season_podium", { p_season: s.id });
      if (podiumErr) throw new Error(podiumErr.message);
      const podium = (podiumData ?? []) as { rank: number; username: string; balance: number }[];
      const medals = ["🥇", "🥈", "🥉"];
      const lines = podium.map((p, i) => `${medals[i] ?? `#${p.rank}`} **${p.username}** — ${fmt(p.balance)}`);
      const champ = podium[0]?.username ?? "nobody";
      const embed: DiscordEmbed = {
        title: `👑 ${s.name} has ended!`,
        description: `Your champion: **${champ}** 🏆\n\n${lines.join("\n")}`,
        color: BRAND,
      };
      if (await postMessage([embed])) {
        const { error } = await supabase.rpc("mark_season_announced", { p_season: s.id });
        if (error) console.error("discord-announcer: mark_season_announced failed", s.id, error);
        else posted++;
      }
    } catch (err) {
      console.error("discord-announcer: season-close announce failed", s.id, err);
    }
  }

  return posted;
}

// ---- watchdog job: money integrity alert (CLAUDE_6.md §9), port of
// main.py's ledger_watchdog. -----------------------------------------------

async function runWatchdog(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("ledger_drift");
  if (error) {
    console.error("discord-announcer: ledger_drift failed", error);
    return 0;
  }
  const drift = (data ?? []) as { discord_id: string; username: string; balance: number; ledger_total: number }[];
  if (drift.length === 0) return 0;

  try {
    const lines = drift
      .slice(0, 10)
      .map((d) => `\`${d.discord_id}\` **${d.username}** — balance ${fmt(d.balance)} vs ledger ${fmt(d.ledger_total)}`);
    if (drift.length > 10) lines.push(`…and ${drift.length - 10} more`);
    const embed: DiscordEmbed = {
      title: "🚨 Ledger integrity alert",
      description:
        "Cached balances disagree with the ledger — a bug may have bypassed the money RPCs. " +
        "Investigate before resolving more markets.\n\n" +
        lines.join("\n"),
      color: RED,
    };
    return (await postMessage([embed])) ? 1 : 0;
  } catch (err) {
    console.error("discord-announcer: watchdog post failed", err);
    return 0;
  }
}

// ---- entrypoint --------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const expectedSecret = Deno.env.get("ANNOUNCER_SECRET");
  const providedSecret = req.headers.get("x-announcer-secret");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response("unauthorized", { status: 401 });
  }

  let job = "announce";
  try {
    const body = await req.json();
    if (body && typeof body.job === "string") job = body.job;
  } catch {
    // no/invalid JSON body — default to "announce" (pg_cron always sends a
    // body, but this keeps a bare curl/manual test working too).
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const posted = job === "watchdog" ? await runWatchdog(supabase) : await runAnnounce(supabase);

  return new Response(JSON.stringify({ posted }), { headers: { "Content-Type": "application/json" } });
});
