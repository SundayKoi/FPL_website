// Discord slash-command handlers — port of the gateway bot's member commands
// (c:\fpl_gambling\bot\main.py's balance/daily/tip/bets/leaderboard/exchange/
// store/buy, backed by bot/service.py) as HTTP-interaction handlers. Every
// exported handler is wired into `commandHandlers` (registry.ts) at the
// bottom of this file — importing this module (route.ts does, for its side
// effects) is what makes the registration happen.
//
// All DB access goes through the betting RPC surface, which is
// service_role-only (service-client.ts) — there is no cookie session on an
// interactions webhook to authorize a cookie-bound client with anyway.
import "server-only";
import { createBettingServiceClient } from "../service-client";
import { badgesFor } from "../queries";
import { fmtPoints } from "../format";
import { commandHandlers } from "./registry";
import type { DiscordInteraction } from "./registry";
import { BRAND, GREEN, embed, errMsg, msg } from "./respond";
import type { DiscordEmbed } from "./respond";

type BettingServiceClient = ReturnType<typeof createBettingServiceClient>;

/** One-time signup credit for a Discord id's first contact with the wallet
 * system, granted via `grant_signup_bonus` before every wallet-touching
 * handler runs (the "ensure-user" pattern) — matches wallet.ts's
 * `SIGNUP_BONUS_AMOUNT`, which does the same thing for the web login path. */
const SIGNUP_BONUS = 1000;

// Escalating daily-bonus tuning — ports bot/config.py's BotSettings defaults
// (DAILY_AMOUNT/DAILY_STREAK_STEP/DAILY_STREAK_MAX env vars in the source).
// No other task wired env-driven tuning for the betting economy, so these
// are hardcoded the same way SIGNUP_BONUS is above.
const DAILY_AMOUNT = 250;
const DAILY_STREAK_STEP = 50;
const DAILY_STREAK_MAX = 7;

const GUILD_ONLY_MSG = "Use this in the server.";

/** Every slash command here is guild-only (registered per-guild, never
 * globally) — a DM interaction has no `member`, so this is a defensive
 * guard rather than an expected path in production. */
interface DiscordUser {
  id: string;
  username?: string;
  global_name?: string;
  avatar?: string | null;
  bot?: boolean;
}

interface CommandOption {
  name: string;
  value?: string | number | boolean;
}

function requireMember(interaction: DiscordInteraction): DiscordUser | null {
  const user: DiscordUser | undefined = interaction.member?.user;
  return user?.id ? user : null;
}

function avatarUrl(user: DiscordUser | undefined): string | null {
  if (!user?.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
}

function getOptions(interaction: DiscordInteraction): CommandOption[] {
  return (interaction.data?.options ?? []) as CommandOption[];
}

function getOption(interaction: DiscordInteraction, name: string): CommandOption | undefined {
  return getOptions(interaction).find((o) => o.name === name);
}

function getStringOption(interaction: DiscordInteraction, name: string): string | null {
  const v = getOption(interaction, name)?.value;
  return typeof v === "string" ? v : null;
}

function getIntegerOption(interaction: DiscordInteraction, name: string): number | null {
  const v = getOption(interaction, name)?.value;
  return typeof v === "number" ? v : null;
}

/** The resolved-data payload Discord attaches to option values that
 * reference other entities (users, roles, ...) — not modeled in
 * registry.ts's `DiscordInteraction` since only this handler needs it. */
function getResolvedUser(interaction: DiscordInteraction, id: string | null): DiscordUser | undefined {
  if (!id) return undefined;
  const resolved = (interaction.data as unknown as { resolved?: { users?: Record<string, DiscordUser> } } | undefined)
    ?.resolved;
  return resolved?.users?.[id];
}

/** `<t:unix:style>` — Discord's client-rendered timestamp markup. */
function discordTimestamp(iso: string, style: "R" | "t"): string {
  return `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`;
}

/** Provisions the wallet on first contact (idempotent server-side) — the
 * "ensure-user" pattern every wallet-touching handler runs first. */
async function ensureUser(service: BettingServiceClient, user: DiscordUser): Promise<void> {
  await service.rpc("grant_signup_bonus", {
    p_user: user.id,
    p_username: user.username ?? user.id,
    p_avatar: avatarUrl(user),
    p_amount: SIGNUP_BONUS,
  });
}

/**
 * Maps a betting RPC's raw `raise exception` text to a friendly message —
 * extends the same mapping style as actions.ts's `friendlyPlaceBetError` et
 * al. for the RPCs this file's handlers call (daily/tip/store).
 */
function friendlyBettingError(message: string): string {
  if (/insufficient balance/i.test(message)) return "Insufficient balance.";
  if (/amount must be positive/i.test(message)) return "Amount must be positive.";
  if (/cannot tip yourself/i.test(message)) return "Pick another member to tip.";
  if (/recipient has no account yet/i.test(message)) return "That member hasn't used the exchange yet.";
  if (/item \d+ inactive/i.test(message)) return "That item isn't available right now.";
  if (/unknown item/i.test(message)) return "That item doesn't exist.";
  if (/unknown purchase/i.test(message)) return "Purchase not found.";
  if (/already fulfilled/i.test(message)) return "That purchase was already fulfilled.";
  if (/already refunded/i.test(message)) return "That purchase was already refunded.";
  if (/unknown user/i.test(message)) return "Account not found — try again.";
  return "Something went wrong.";
}

// ---- /balance ---------------------------------------------------------------

interface WalletRow {
  balance: number;
  wins: number;
  losses: number;
}

async function handleBalance(interaction: DiscordInteraction): Promise<object> {
  const member = requireMember(interaction);
  if (!member) return errMsg(GUILD_ONLY_MSG);

  const service = createBettingServiceClient();
  await ensureUser(service, member);

  const { data } = await service
    .from("betting_leaderboard")
    .select("balance, wins, losses")
    .eq("discord_id", member.id)
    .maybeSingle();
  const wallet = (data as WalletRow | null) ?? { balance: 0, wins: 0, losses: 0 };

  const e: DiscordEmbed = {
    title: "Wallet",
    color: BRAND,
    fields: [
      { name: "Balance", value: fmtPoints(wallet.balance) },
      { name: "Record", value: `${wallet.wins}W / ${wallet.losses}L` },
    ],
  };
  return embed(e, true);
}

// ---- /daily -------------------------------------------------------------------

interface DailyClaimRow {
  amount: number;
  balance: number;
  streak: number;
}

async function handleDaily(interaction: DiscordInteraction): Promise<object> {
  const member = requireMember(interaction);
  if (!member) return errMsg(GUILD_ONLY_MSG);

  const service = createBettingServiceClient();
  await ensureUser(service, member);

  const { data, error } = await service.rpc("claim_daily_streak", {
    p_user: member.id,
    p_amount: DAILY_AMOUNT,
    p_step: DAILY_STREAK_STEP,
    p_max: DAILY_STREAK_MAX,
  });

  if (error) {
    if (/already claimed/i.test(error.message)) {
      const { data: nextData } = await service.rpc("daily_next_at", { p_user: member.id });
      const nextIso = nextData as string | null;
      const when = nextIso ? ` Come back ${discordTimestamp(nextIso, "R")} (at ${discordTimestamp(nextIso, "t")}).` : "";
      return errMsg(`You've already claimed your daily.${when}`);
    }
    return errMsg(friendlyBettingError(error.message));
  }

  const row = (Array.isArray(data) ? data[0] : data) as DailyClaimRow;
  const streakNote = row.streak > 1 ? ` · 🔥 **${row.streak}-day streak**` : "";
  const e: DiscordEmbed = {
    description: `💰 **+${fmtPoints(row.amount)}** claimed — balance **${fmtPoints(row.balance)}**${streakNote}`,
    color: GREEN,
  };
  return embed(e, true);
}

// ---- /tip -----------------------------------------------------------------

async function handleTip(interaction: DiscordInteraction): Promise<object> {
  const member = requireMember(interaction);
  if (!member) return errMsg(GUILD_ONLY_MSG);

  const targetId = getStringOption(interaction, "user");
  const target = getResolvedUser(interaction, targetId);
  const amount = getIntegerOption(interaction, "amount");

  // Reject self/bots/non-positive amounts BEFORE any RPC — mirrors
  // main.py's tip(), which validates before its first `ensure_user` call.
  if (!targetId || target?.bot || targetId === member.id) {
    return errMsg("Pick another member to tip.");
  }
  if (amount === null || amount <= 0) {
    return errMsg("Amount must be positive.");
  }

  const service = createBettingServiceClient();
  await ensureUser(service, member);
  await ensureUser(service, target ?? { id: targetId });

  const { error } = await service.rpc("tip_points", {
    p_from: member.id,
    p_to: targetId,
    p_amount: amount,
  });
  if (error) return errMsg(friendlyBettingError(error.message));

  const e: DiscordEmbed = {
    description: `🎁 <@${member.id}> tipped **${fmtPoints(amount)}** to <@${targetId}>!`,
    color: BRAND,
  };
  return embed(e, false); // public — tips are social
}

// ---- /bets ------------------------------------------------------------------

interface BetRow {
  market_id: number;
  team_id: number | null;
  is_draw: boolean;
  amount: number;
  payout: number | null;
  settled: boolean;
}

async function handleBets(interaction: DiscordInteraction): Promise<object> {
  const member = requireMember(interaction);
  if (!member) return errMsg(GUILD_ONLY_MSG);

  const service = createBettingServiceClient();
  const { data } = await service
    .from("betting_bets")
    .select("market_id, team_id, is_draw, amount, payout, settled")
    .eq("discord_id", member.id)
    .order("settled", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(10);
  const bets = (data as BetRow[] | null) ?? [];
  if (bets.length === 0) {
    return msg("No bets yet — place one on the site!", true);
  }

  const marketIds = [...new Set(bets.map((b) => b.market_id))];
  const teamIds = [...new Set(bets.map((b) => b.team_id).filter((id): id is number => id != null))];
  const [marketsResult, teamsResult] = await Promise.all([
    service.from("betting_markets").select("id, title").in("id", marketIds),
    teamIds.length > 0
      ? service.from("betting_teams").select("id, short_code").in("id", teamIds)
      : Promise.resolve({ data: [] as { id: number; short_code: string }[] }),
  ]);
  const titles = new Map(
    ((marketsResult.data as { id: number; title: string | null }[] | null) ?? []).map((m) => [m.id, m.title])
  );
  const codes = new Map(((teamsResult.data as { id: number; short_code: string }[] | null) ?? []).map((t) => [t.id, t.short_code]));

  const lines = bets.map((b) => {
    const market = titles.get(b.market_id) ?? `Market ${b.market_id}`;
    const team = b.is_draw ? "Draw" : (b.team_id !== null ? (codes.get(b.team_id) ?? "?") : "?");
    if (!b.settled) return `🟡 **${market}** — ${fmtPoints(b.amount)} on ${team}`;
    if ((b.payout ?? 0) > 0) return `🟢 **${market}** — won **+${fmtPoints((b.payout ?? 0) - b.amount)}**`;
    return `🔴 **${market}** — lost ${fmtPoints(b.amount)}`;
  });

  const e: DiscordEmbed = { title: "Your bets", description: lines.join("\n"), color: BRAND };
  return embed(e, true);
}

// ---- /leaderboard -----------------------------------------------------------

interface LeaderboardRow {
  username: string;
  balance: number;
  current_streak: number;
  perfect_pickems: number;
}

async function handleLeaderboard(): Promise<object> {
  const service = createBettingServiceClient();
  const { data } = await service
    .from("betting_leaderboard")
    .select("username, balance, current_streak, perfect_pickems")
    .order("balance", { ascending: false })
    .order("discord_id", { ascending: true })
    .limit(10);
  const rows = (data as LeaderboardRow[] | null) ?? [];

  const medals = ["🥇", "🥈", "🥉"];
  const lines = rows.map((r, i) => {
    const badges = badgesFor(r.current_streak, r.perfect_pickems);
    const badgeText = badges.length > 0 ? `  ${badges.join(" ")}` : "";
    return `${i < 3 ? medals[i] : `\`#${i + 1}\``} **${r.username}** — ${fmtPoints(r.balance)}${badgeText}`;
  });

  const e: DiscordEmbed = { title: "Leaderboard", description: lines.join("\n") || "Nobody yet.", color: BRAND };
  return embed(e, false);
}

// ---- /exchange ----------------------------------------------------------------

interface OpenMarketRow {
  id: number;
  title: string | null;
  game_at: string;
  team_a_id: number;
  team_b_id: number;
}

/** SITE_URL is the spec'd/primary name; NEXT_PUBLIC_SITE_URL (the rest of
 * the repo's canonical-origin var — see auth/siteOrigin.ts) is accepted as a
 * fallback so a deploy only has to set one of the two. */
function siteUrl(): string {
  return process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
}

async function handleExchange(interaction: DiscordInteraction): Promise<object> {
  const member = requireMember(interaction);
  if (!member) return errMsg(GUILD_ONLY_MSG);

  const service = createBettingServiceClient();
  await ensureUser(service, member);

  const { data: walletData } = await service
    .from("betting_leaderboard")
    .select("balance")
    .eq("discord_id", member.id)
    .maybeSingle();
  const balance = (walletData as { balance: number } | null)?.balance ?? 0;

  const { data: marketsData } = await service
    .from("betting_markets")
    .select("id, title, game_at, team_a_id, team_b_id")
    .eq("status", "OPEN")
    .gt("lock_at", new Date().toISOString())
    .order("game_at", { ascending: true })
    .limit(5);
  const markets = (marketsData as OpenMarketRow[] | null) ?? [];

  let codes = new Map<number, string>();
  if (markets.length > 0) {
    const teamIds = [...new Set(markets.flatMap((m) => [m.team_a_id, m.team_b_id]))];
    const { data: teamsData } = await service.from("betting_teams").select("id, short_code").in("id", teamIds);
    codes = new Map(((teamsData as { id: number; short_code: string }[] | null) ?? []).map((t) => [t.id, t.short_code]));
  }

  const site = siteUrl();
  const e: DiscordEmbed = {
    title: "FPL Exchange",
    url: `${site}/betting`,
    description: `Your balance: **${fmtPoints(balance)}**`,
    color: BRAND,
  };
  if (markets.length > 0) {
    e.fields = [
      {
        name: "Open markets",
        value: markets
          .map((m) => {
            const title = m.title ?? `${codes.get(m.team_a_id) ?? "?"} vs ${codes.get(m.team_b_id) ?? "?"}`;
            return `• [${title}](${site}/betting/market/${m.id}) — ${discordTimestamp(m.game_at, "R")}`;
          })
          .join("\n"),
        inline: false,
      },
    ];
  }
  return embed(e, true);
}

// ---- /store -------------------------------------------------------------------

interface StoreItemRow {
  id: number;
  name: string;
  description: string | null;
  cost: number;
}

async function handleStore(): Promise<object> {
  const service = createBettingServiceClient();
  const { data } = await service
    .from("betting_store_items")
    .select("id, name, description, cost")
    .eq("active", true)
    .order("cost", { ascending: true });
  const items = (data as StoreItemRow[] | null) ?? [];
  if (items.length === 0) {
    return msg("The store is empty right now.", true);
  }

  const e: DiscordEmbed = {
    title: "Store",
    color: BRAND,
    fields: items.map((it) => ({
      name: `\`${it.id}\` ${it.name} — ${fmtPoints(it.cost)}`,
      value: it.description ?? "—",
      inline: false,
    })),
    footer: { text: "Buy with /buy item:<id>" },
  };
  return embed(e, true);
}

// ---- /buy -----------------------------------------------------------------

interface PurchasableItem {
  name: string;
  type: string;
  payload: Record<string, unknown>;
  cost: number;
}

/** Grants a `discord_role` store item via the Discord REST API (no gateway
 * client to hand a Guild/Member object to, unlike main.py's bot). Throws on
 * any non-2xx response — the caller refunds on any thrown error. */
async function grantDiscordRole(userId: string, roleId: string): Promise<void> {
  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
    method: "PUT",
    headers: { Authorization: `Bot ${botToken}` },
  });
  if (!res.ok) {
    throw new Error(`role grant failed: ${res.status}`);
  }
}

async function handleBuy(interaction: DiscordInteraction): Promise<object> {
  const member = requireMember(interaction);
  if (!member) return errMsg(GUILD_ONLY_MSG);

  const itemId = getIntegerOption(interaction, "item");
  if (itemId === null) return errMsg("Pick an item.");

  const service = createBettingServiceClient();
  await ensureUser(service, member);

  // Fetch the item BEFORE charging the wallet: start_purchase (below) debits
  // the user immediately, and this endpoint has no way to distinguish "the
  // item doesn't exist" from "the read failed" after the fact — either way,
  // charging first and then bailing out here would leave the user out of
  // pocket with nothing granted and no refund issued.
  const { data: itemData, error: itemError } = await service
    .from("betting_store_items")
    .select("name, type, payload, cost")
    .eq("id", itemId)
    .maybeSingle();
  const item = itemData as PurchasableItem | null;
  if (itemError || !item) return errMsg("That item doesn't exist.");

  const { data: purchaseId, error: startError } = await service.rpc("start_purchase", {
    p_user: member.id,
    p_item: itemId,
  });
  if (startError) return errMsg(friendlyBettingError(startError.message));

  // Fulfill — and refund if granting fails, so nobody pays for nothing.
  // Ports main.py's buy() try/except around the fulfillment step verbatim.
  try {
    if (item.type === "discord_role") {
      const roleId = String(item.payload.role_id);
      await grantDiscordRole(member.id, roleId);
      const { error: fulfillError } = await service.rpc("fulfill_purchase", {
        p_purchase: purchaseId,
        p_ref: `role:${roleId}`,
      });
      if (fulfillError) throw new Error(fulfillError.message);
    } else {
      // Unknown item types are fulfilled manually by staff; mark pending.
      const { error: fulfillError } = await service.rpc("fulfill_purchase", {
        p_purchase: purchaseId,
        p_ref: "manual",
      });
      if (fulfillError) throw new Error(fulfillError.message);
    }
  } catch (fulfillErr) {
    // Port of main.py's `log.exception("fulfillment failed for purchase
    // %s — refunding", p["purchase_id"])` — the original failure (role
    // grant threw, or fulfill_purchase itself returned an RPC error) must
    // not be silently swallowed just because the code below tries to
    // recover from it.
    console.error(`buy: fulfillment failed for purchase ${purchaseId} — refunding`, fulfillErr);

    const { data: balanceData, error: refundError } = await service.rpc("refund_purchase", {
      p_purchase: purchaseId,
    });
    if (refundError) {
      // The refund itself failed (e.g. the purchase was already fulfilled
      // by a concurrent retry) — do NOT tell the user they were refunded
      // when they weren't. The purchase row is left as-is for staff to
      // resolve manually from the admin area.
      console.error(`buy: refund_purchase also failed for purchase ${purchaseId}`, refundError);
      return errMsg(
        `Couldn't grant **${item.name}** and the automatic refund failed — contact staff with purchase #${purchaseId} for a manual refund.`
      );
    }
    const balance = balanceData as number;
    return errMsg(`Couldn't grant **${item.name}** — you were refunded (balance ${fmtPoints(balance)}).`);
  }

  const e: DiscordEmbed = { description: `✅ **${item.name}** is yours! (−${fmtPoints(item.cost)})`, color: GREEN };
  return embed(e, true);
}

// ---- registration -----------------------------------------------------------
// Direct assignment into the shared registry map (registry.ts) rather than an
// explicit `register()` function the route calls — route.ts imports this
// module for its side effects (see the file header), so assignment at module
// load is sufficient and matches how route.test.ts already pre-populates the
// same map directly in its own tests.
commandHandlers.balance = handleBalance;
commandHandlers.daily = handleDaily;
commandHandlers.tip = handleTip;
commandHandlers.bets = handleBets;
commandHandlers.leaderboard = handleLeaderboard;
commandHandlers.exchange = handleExchange;
commandHandlers.store = handleStore;
commandHandlers.buy = handleBuy;
