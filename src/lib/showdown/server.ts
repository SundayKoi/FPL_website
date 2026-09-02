// Showdown's server module: every transition a player can cause, and the
// one read that builds their view. Higher-Lower's shape — validation and
// state changes live here, actions.ts is a thin adapter — with the
// Gauntlet's discipline: the engine computes, showdown_commit writes,
// and a stale version is retried from a fresh read rather than forced.
//
// Who may act is decided here from the session: the Discord id comes
// from getBettingUser(), never from the client. The table's secret state
// is read here and leaves only as the viewer's own two cards.

import "server-only";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { getBettingUser } from "@/lib/betting/wallet";
import type { BettingUser } from "@/lib/betting/types";
import { fetchCardSeason, fetchCurrentWeekCards, fetchEditionCards } from "@/lib/cards/queries";
import { fetchInventory, fetchInventoryByIds } from "@/lib/packs/queries";
import { mondayOf } from "@/lib/packs/week";
import { cardFromEdition, cardFromInventory, dealHouseStack } from "./cards";
import { BRACKETS, OPENABLE_BRACKETS, SEATS_MAX, STACK_SIZE, stackFits, type Bracket, type BracketKey } from "./config";
import {
  applyAction,
  applyTimeout,
  canDeal,
  markLeaving,
  newSeat,
  seatRows,
  ShowdownError,
  startHand,
  viewFor,
  type Action,
  type EngineContext,
  type HandResult,
  type PublicState,
  type SecretState,
  type Step,
} from "./engine";
import type { ShowdownCard } from "./hands";
import { GOLD, postCardsWebhook } from "@/lib/packs/announce";
import { aggregateWeek, type WeekBoard } from "./leaderboard";
import { fetchHandsSince, fetchOpenTables, fetchSecret, fetchTable, fetchTablesDue, fetchViewerSeat, type TableRow } from "./queries";
import { secureRand } from "./random";

export type { Action } from "./engine";

/** What a page or the felt gets: the table, everyone's public state, and
 *  only your own cards. */
export interface TableView {
  table: Pick<TableRow, "id" | "bracket" | "season" | "name" | "code" | "status" | "version" | "handNo" | "deadlineAt">;
  bracket: Bracket;
  state: PublicState;
  myHole: ShowdownCard[];
  myStack: ShowdownCard[];
  mySeat: number | null;
  viewer: { discordId: string; username: string; balance: number } | null;
  serverNow: string;
}

/** A copy on the viewer's shelf, thin, for the stack builder. */
export interface StackOption {
  id: number;
  name: string;
  team: string;
  role: string;
  overall: number;
  tier: string;
  foil: boolean;
  week: string;
}

export class ShowdownActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShowdownActionError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

function messageOf(error: unknown): string {
  return isRecord(error) && typeof error.message === "string" ? error.message : String(error);
}

async function requirePlayer(): Promise<BettingUser> {
  const user = await getBettingUser();
  if (!user) throw new ShowdownActionError("Sign in with Discord to play.");
  if (!user.allowed) throw new ShowdownActionError("Showdown is for league members.");
  return user;
}

async function requireTable(service: ReturnType<typeof createBettingServiceClient>, tableId: number): Promise<TableRow> {
  if (!Number.isInteger(tableId) || tableId <= 0) throw new ShowdownActionError("Unknown table.");
  const table = await fetchTable(service, tableId);
  if (!table) throw new ShowdownActionError("Unknown table.");
  return table;
}

function contextFor(table: TableRow): EngineContext {
  return { bracket: BRACKETS[table.bracket], now: new Date(), rand: secureRand };
}

/** This week's edition as ShowdownCards, for the board and house stacks. */
async function loadEdition(service: ReturnType<typeof createBettingServiceClient>, season: string): Promise<ShowdownCard[]> {
  const week = mondayOf(new Date());
  const archived = await fetchEditionCards(service, season, week);
  const cards = archived.length > 0 ? archived : await fetchCurrentWeekCards(service, season);
  return cards.map((card) => cardFromEdition(card, week));
}

/**
 * The engine's write. On a stale version the caller re-reads and retries;
 * anything else is a real refusal (the balance check, most importantly)
 * and surfaces as-is.
 */
async function commit(
  service: ReturnType<typeof createBettingServiceClient>,
  table: TableRow,
  step: Step,
): Promise<number> {
  const status = step.pub.hand ? "hand" : "waiting";
  const handNo = step.pub.hand?.handNo ?? step.pub.lastHand?.handNo ?? table.handNo;
  const { data, error } = await service.rpc("showdown_commit", {
    p_table: table.id,
    p_version: table.version,
    p_status: status,
    p_hand_no: handNo,
    p_public: step.pub,
    p_secret: step.secret,
    p_seats: seatRows(step.pub),
    p_rake: step.rake,
    p_hand: step.settled,
    p_deadline: step.pub.hand?.deadlineAt ?? null,
  });
  if (error) throw error;
  return data as number;
}

const STALE = "stale table version";
const RETRIES = 3;

/** Read, compute, commit; on a stale version, read again. */
async function transition(
  service: ReturnType<typeof createBettingServiceClient>,
  tableId: number,
  compute: (table: TableRow, secret: SecretState) => Promise<Step | null> | Step | null,
): Promise<TableRow> {
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    const table = await requireTable(service, tableId);
    const secret = await fetchSecret(service, tableId);
    const step = await compute(table, secret);
    if (!step) return table;
    try {
      await commit(service, table, step);
      if (step.settled?.best?.rank === "foil_royal") await announceFoilRoyal(table, step.settled);
      return (await fetchTable(service, tableId))!;
    } catch (error) {
      if (!messageOf(error).includes(STALE) || attempt === RETRIES - 1) throw error;
    }
  }
  throw new ShowdownActionError("The table moved on; try again.");
}

/** Deal if the table is waiting and can. Returns the step or null. */
async function dealIfReady(
  service: ReturnType<typeof createBettingServiceClient>,
  table: TableRow,
  secret: SecretState,
): Promise<Step | null> {
  if (table.status !== "waiting" || !canDeal(table.publicState, secret)) return null;
  const edition = await loadEdition(service, table.season);
  return startHand(table.publicState, secret, contextFor(table), edition);
}

/**
 * A Foil Royal is the top of the ladder and rare enough to be news. Best
 * effort, after the commit: postCardsWebhook swallows its own failures,
 * and a Discord outage must never undo a settled hand.
 */
async function announceFoilRoyal(table: TableRow, result: HandResult): Promise<void> {
  const best = result.best;
  if (!best) return;
  const who = result.players[best.seatNo]?.username ?? `Seat ${best.seatNo + 1}`;
  const held = result.shown[best.seatNo] ?? [];
  const site = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const bracket = BRACKETS[table.bracket];
  await postCardsWebhook({
    title: "🃏 A FOIL ROYAL AT THE TABLE",
    description:
      `**${who}** turned over a Foil Royal at **${table.name}** — hand ${result.handNo}, ` +
      `${bracket.free ? "a practice table" : `the ${bracket.label} table`}.\n` +
      (held.length ? `Held: ${held.map((card) => `${card.name ?? card.team} (${card.team} ${card.role} ${card.overall})`).join(", ")}\n` : "") +
      `Board: ${result.board.map((card) => `${card.name ?? card.team} ${card.overall}`).join(", ")}\n` +
      `Pot ${result.pot.toLocaleString("en-US")}${bracket.free ? " in play chips" : ""}.` +
      (site ? `\n[Showdown](${site}/cards/showdown)` : ""),
    color: GOLD,
  });
}

// === reads ==================================================================

export async function loadTableView(tableId: number): Promise<TableView | null> {
  const service = createBettingServiceClient();
  const table = await fetchTable(service, tableId);
  if (!table) return null;
  const user = await getBettingUser();
  const secret = await fetchSecret(service, tableId);
  return buildView(table, secret, user);
}

function buildView(table: TableRow, secret: SecretState, user: BettingUser | null): TableView {
  const view = viewFor(table.publicState, secret, user?.discordId ?? null);
  const mine = user ? table.publicState.seats.find((seat) => seat.discordId === user.discordId) : null;
  return {
    table: {
      id: table.id,
      bracket: table.bracket,
      season: table.season,
      name: table.name,
      code: table.code,
      status: table.status,
      version: table.version,
      handNo: table.handNo,
      deadlineAt: table.deadlineAt,
    },
    bracket: BRACKETS[table.bracket],
    state: { seats: view.seats, dealerSeat: view.dealerSeat, hand: view.hand, lastHand: view.lastHand },
    myHole: view.myHole,
    myStack: view.myStack,
    mySeat: mine?.seatNo ?? null,
    viewer: user ? { discordId: user.discordId, username: user.username, balance: user.balance } : null,
    serverNow: new Date().toISOString(),
  };
}

export async function loadLobby(): Promise<{
  season: string | null;
  tables: Awaited<ReturnType<typeof fetchOpenTables>>;
  seatedAt: number | null;
  signedIn: boolean;
}> {
  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, "premier");
  if (!season) return { season: null, tables: [], seatedAt: null, signedIn: false };
  const user = await getBettingUser();
  const [tables, seat] = await Promise.all([
    fetchOpenTables(service, season),
    user ? fetchViewerSeat(service, user.discordId) : Promise.resolve(null),
  ]);
  return { season, tables, seatedAt: seat?.tableId ?? null, signedIn: user !== null };
}

/** The viewer's shelf as stack options: current season, any week. */
export async function loadStackOptions(): Promise<StackOption[]> {
  const user = await getBettingUser();
  if (!user) return [];
  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, "premier");
  if (!season) return [];
  const rows = await fetchInventory(service, user.discordId, season);
  return rows
    .filter((row) => !row.card.moment && !row.card.champWin && !row.card.team)
    .map((row) => {
      const card = cardFromInventory(row);
      return { id: row.id, name: card.name ?? row.playerName, team: card.team, role: card.role, overall: card.overall, tier: card.tier, foil: card.foil, week: row.editionWeek };
    });
}

// === transitions ============================================================

export async function createTable(input: unknown): Promise<number> {
  const user = await requirePlayer();
  if (!isRecord(input)) throw new ShowdownActionError("Bad request.");
  const bracket = typeof input.bracket === "string" && (OPENABLE_BRACKETS as string[]).includes(input.bracket) ? (input.bracket as BracketKey) : null;
  if (!bracket) throw new ShowdownActionError("That table cannot be opened right now.");
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 40) : "";
  if (name.length < 2) throw new ShowdownActionError("Give the table a name.");
  const isPrivate = input.private === true;
  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, "premier");
  if (!season) throw new ShowdownActionError("No card season is running.");
  const code = isPrivate ? Math.random().toString(36).slice(2, 8).toUpperCase() : null;
  const { data, error } = await service
    .from("showdown_tables")
    .insert({ bracket, season, name, code, created_by: user.discordId, public_state: { seats: [], dealerSeat: null, hand: null, lastHand: null } })
    .select("id")
    .single();
  if (error) throw new ShowdownActionError(`Could not open the table: ${error.message}`);
  return (data as { id: number }).id;
}

/**
 * Take a seat. The RPC does the money and the lock; then the seat joins
 * the public state and its stack the secret state through a commit, and
 * the table deals if it can.
 */
export async function sitDown(input: unknown): Promise<TableView> {
  const user = await requirePlayer();
  if (!isRecord(input)) throw new ShowdownActionError("Bad request.");
  const tableId = Number(input.tableId);
  const seatNo = Number(input.seatNo);
  const buyIn = Number(input.buyIn);
  const house = input.house === true;
  const cardIds = Array.isArray(input.cardIds) ? input.cardIds.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [];
  if (!Number.isInteger(seatNo) || seatNo < 0 || seatNo >= SEATS_MAX) throw new ShowdownActionError("Pick a seat.");
  if (!Number.isInteger(buyIn) || buyIn <= 0) throw new ShowdownActionError("Enter a buy-in.");

  const service = createBettingServiceClient();
  const table = await requireTable(service, tableId);
  const bracket = BRACKETS[table.bracket];
  if (buyIn < bracket.minBuyIn || buyIn > bracket.maxBuyIn) {
    throw new ShowdownActionError(`Buy-in at this table is ${bracket.minBuyIn} to ${bracket.maxBuyIn}.`);
  }
  if (!bracket.free && buyIn > user.balance) throw new ShowdownActionError("You do not have that many dollars.");

  let stack: ShowdownCard[];
  if (house) {
    const edition = await loadEdition(service, table.season);
    const dealt = dealHouseStack(edition, bracket, secureRand);
    if (!dealt) throw new ShowdownActionError("The house cannot deal a stack from this edition.");
    stack = dealt;
  } else {
    const unique = [...new Set(cardIds)];
    if (unique.length !== STACK_SIZE) throw new ShowdownActionError(`Bring exactly ${STACK_SIZE} cards.`);
    const rows = await fetchInventoryByIds(service, user.discordId, unique);
    if (rows.length !== STACK_SIZE) throw new ShowdownActionError("Some of those cards are not yours.");
    if (rows.some((row) => row.season !== table.season)) throw new ShowdownActionError("Only this season's cards can sit down.");
    if (rows.some((row) => row.card.moment || row.card.champWin || row.card.team)) throw new ShowdownActionError("Relics and plates cannot sit down.");
    stack = rows.map(cardFromInventory);
    const fit = stackFits(stack.map((card) => card.overall), bracket);
    if (!fit.ok) throw new ShowdownActionError(fit.reason);
  }

  const { error } = await service.rpc("showdown_sit", {
    p_table: tableId,
    p_user: user.discordId,
    p_seat: seatNo,
    p_buy_in: buyIn,
    p_cards: house ? [] : stack.map((card) => Number(card.id)),
    p_house: house,
  });
  if (error) throw new ShowdownActionError(friendlySitError(error.message));

  const updated = await transition(service, tableId, (fresh, secret) => {
    if (fresh.publicState.seats.some((seat) => seat.seatNo === seatNo)) return null;
    const pub: PublicState = {
      ...fresh.publicState,
      seats: [...fresh.publicState.seats, newSeat({ seatNo, discordId: user.discordId, username: user.username, chips: buyIn, houseStack: house })],
    };
    const nextSecret: SecretState = { ...secret, stacks: { ...secret.stacks, [seatNo]: stack } };
    return { pub, secret: nextSecret, rake: 0, settled: null };
  });
  const dealt = await transition(service, tableId, (fresh, secret) => dealIfReady(service, fresh, secret));
  return buildView(dealt ?? updated, await fetchSecret(service, tableId), { ...user, balance: bracket.free ? user.balance : user.balance - buyIn });
}

function friendlySitError(message: string): string {
  if (message.includes("already seated")) return "You already have a seat at a table. Stand up there first.";
  if (message.includes("seat is taken")) return "Someone took that seat.";
  if (message.includes("insufficient balance")) return "You do not have that many dollars.";
  if (message.includes("card is at a table")) return "One of those cards is already at a table.";
  if (message.includes("cap is")) return message;
  if (message.includes("buy-in must be")) return message;
  return `Could not sit down: ${message}`;
}

/**
 * Leave. Between hands, or once folded and sitting out, the RPC returns
 * the chips and releases the cards. Mid-hand and still in it, the seat is
 * marked leaving (it folds when asked to act) and stands after the hand.
 */
export async function standUp(input: unknown): Promise<{ left: boolean; view: TableView }> {
  const user = await requirePlayer();
  const tableId = isRecord(input) ? Number(input.tableId) : NaN;
  const service = createBettingServiceClient();
  let table = await requireTable(service, tableId);
  const seat = table.publicState.seats.find((entry) => entry.discordId === user.discordId);
  if (!seat) throw new ShowdownActionError("You are not at this table.");

  const inHand = table.status === "hand" && seat.inHand && !seat.folded;
  if (inHand) {
    table = await transition(service, tableId, (fresh, secret) => {
      const mine = fresh.publicState.seats.find((entry) => entry.discordId === user.discordId);
      if (!mine || !mine.inHand || mine.folded || !fresh.publicState.hand) return null;
      const ctx = contextFor(fresh);
      if (fresh.publicState.hand.toAct === mine.seatNo) {
        return applyAction(markLeaving(fresh.publicState, mine.seatNo), secret, ctx, mine.seatNo, { type: "fold" });
      }
      return { pub: markLeaving(fresh.publicState, mine.seatNo), secret, rake: 0, settled: null };
    });
    const still = table.publicState.seats.find((entry) => entry.discordId === user.discordId);
    if (table.status === "hand" && still && still.status !== "sitting_out") {
      return { left: false, view: buildView(table, await fetchSecret(service, tableId), user) };
    }
  }

  const { data, error } = await service.rpc("showdown_stand", { p_table: tableId, p_user: user.discordId });
  if (error) {
    if (error.message.includes("hand in progress")) {
      return { left: false, view: buildView(table, await fetchSecret(service, tableId), user) };
    }
    throw new ShowdownActionError(`Could not stand up: ${error.message}`);
  }
  const balance = data as number;

  const after = await transition(service, tableId, (fresh, secret) => {
    if (!fresh.publicState.seats.some((entry) => entry.discordId === user.discordId)) return null;
    const pub: PublicState = { ...fresh.publicState, seats: fresh.publicState.seats.filter((entry) => entry.discordId !== user.discordId) };
    const stacks = { ...secret.stacks };
    delete stacks[seat.seatNo];
    return { pub, secret: { ...secret, stacks }, rake: 0, settled: null };
  });
  return { left: true, view: buildView(after, await fetchSecret(service, tableId), { ...user, balance }) };
}

/** Your move. */
export async function act(input: unknown): Promise<TableView> {
  const user = await requirePlayer();
  if (!isRecord(input)) throw new ShowdownActionError("Bad request.");
  const tableId = Number(input.tableId);
  const action = parseAction(input.action);
  const service = createBettingServiceClient();
  const table = await transition(service, tableId, async (fresh, secret) => {
    const mine = fresh.publicState.seats.find((entry) => entry.discordId === user.discordId);
    if (!mine) throw new ShowdownActionError("You are not at this table.");
    try {
      // One engine step per commit: if this settles the hand, the next
      // deal is the second transition below, against the new version.
      return applyAction(fresh.publicState, secret, contextFor(fresh), mine.seatNo, action);
    } catch (error) {
      if (error instanceof ShowdownError) throw new ShowdownActionError(error.message);
      throw error;
    }
  });
  const dealt = await transition(service, tableId, (fresh, secret) => dealIfReady(service, fresh, secret));
  return buildView(dealt ?? table, await fetchSecret(service, tableId), user);
}

function parseAction(raw: unknown): Action {
  if (!isRecord(raw) || typeof raw.type !== "string") throw new ShowdownActionError("Bad action.");
  switch (raw.type) {
    case "fold":
    case "check":
    case "call":
      return { type: raw.type };
    case "bet":
    case "raise": {
      const to = Number(raw.to);
      if (!Number.isInteger(to) || to <= 0) throw new ShowdownActionError("Enter an amount.");
      return { type: raw.type, to };
    }
    default:
      throw new ShowdownActionError("Bad action.");
  }
}

/**
 * Catch the table up: fold whoever ran out of clock, deal if it can, and
 * return the viewer's fresh view. Any client may call this; the version
 * makes one commit win and the rest re-read.
 */
export async function syncTable(input: unknown): Promise<TableView> {
  const tableId = isRecord(input) ? Number(input.tableId) : NaN;
  const service = createBettingServiceClient();
  const user = await getBettingUser();
  const timed = await transition(service, tableId, (fresh, secret) => applyTimeout(fresh.publicState, secret, contextFor(fresh)));
  const dealt = await transition(service, tableId, (fresh, secret) => dealIfReady(service, fresh, secret));
  return buildView(dealt ?? timed, await fetchSecret(service, tableId), user);
}

/**
 * The sweep: for every table whose clock is a second gone, or that is
 * waiting with two players, run the same two transitions a watching
 * client would. Called by the Vercel cron every minute so a table nobody
 * has open still moves. Returns what it touched.
 */
export async function sweepTables(now = new Date()): Promise<{ looked: number; moved: number; errors: string[] }> {
  const service = createBettingServiceClient();
  const due = await fetchTablesDue(service, now);
  let moved = 0;
  const errors: string[] = [];
  for (const tableId of due) {
    try {
      const before = await fetchTable(service, tableId);
      const timed = await transition(service, tableId, (fresh, secret) => applyTimeout(fresh.publicState, secret, contextFor(fresh)));
      const dealt = await transition(service, tableId, (fresh, secret) => dealIfReady(service, fresh, secret));
      if ((dealt ?? timed).version !== before?.version) moved += 1;
    } catch (error) {
      errors.push(`table ${tableId}: ${messageOf(error)}`);
    }
  }
  return { looked: due.length, moved, errors };
}

/** This week's board, from Monday. */
export async function loadWeekBoard(): Promise<{ week: string; board: WeekBoard } | null> {
  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, "premier");
  if (!season) return null;
  const week = mondayOf(new Date());
  const rows = await fetchHandsSince(service, season, `${week}T00:00:00Z`);
  return { week, board: aggregateWeek(rows) };
}
