import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "./build";
import { DRAW_EMPTY_HEADLINE, DRAW_TAGLINE, drawPanelState, fetchDrawHistory, fetchLatestDraw, fetchTicketCount } from "./draw-queries";

/** The frozen snapshot run_weekly_draw writes into weekly_draws.card — a
 *  whole PlayerCardData, already stamped with the laurel. */
function frozen(overrides: Partial<PlayerCardData> = {}): PlayerCardData {
  return {
    slug: "7gen-na1",
    name: "7gen",
    tag: "NA1",
    teamName: "The Original Mocha House",
    teamImageUrl: null,
    teamAbbr: null,
    role: "Bot",
    overall: 74,
    tier: { key: "platinum", label: "Platinum" },
    archetype: "Glass Cannon",
    signature: { champion: "Jhin", games: 4 },
    artSkin: 0,
    motto: null,
    drawWin: { weekStart: "2026-08-24" },
    ...overrides,
  } as PlayerCardData;
}

function drawDbRow(overrides: Record<string, unknown> = {}) {
  return {
    season: "S5",
    week_start: "2026-08-24",
    discord_id: "42",
    card: frozen(),
    pot: 250,
    drawn_at: "2026-08-25T13:00:00.000Z",
    ...overrides,
  };
}

interface TableStub {
  data?: unknown;
  count?: number;
  error?: { message: string } | null;
}

interface Captured {
  eqs: { table: string; column: string; value: unknown }[];
  orders: { column: string; ascending?: boolean }[];
  selects: { table: string; columns: string; options?: unknown }[];
}

/** A Supabase stand-in in the shape queries.test.ts uses: one chain per
 *  table, awaitable (`then`) for list reads and `.maybeSingle()` for the
 *  single ones, with the filters recorded so a test can prove what was
 *  asked for. */
function drawSupabase(tables: Record<string, TableStub>, captured?: Captured): SupabaseClient {
  return {
    from: (table: string) => {
      const stub = tables[table] ?? { data: [] };
      const answer = () =>
        Promise.resolve({
          data: stub.error ? null : stub.data ?? null,
          count: stub.error ? null : stub.count ?? null,
          error: stub.error ?? null,
        });
      const chain: Record<string, unknown> = {};
      chain.select = (columns: string, options?: unknown) => {
        captured?.selects.push({ table, columns, options });
        return chain;
      };
      chain.eq = (column: string, value: unknown) => {
        captured?.eqs.push({ table, column, value });
        return chain;
      };
      chain.order = (column: string, options?: { ascending?: boolean }) => {
        captured?.orders.push({ column, ascending: options?.ascending });
        return chain;
      };
      chain.limit = () => chain;
      chain.maybeSingle = answer;
      chain.then = (resolve: (r: unknown) => unknown) => answer().then(resolve);
      return chain;
    },
  } as unknown as SupabaseClient;
}

function capture(): Captured {
  return { eqs: [], orders: [], selects: [] };
}

describe("fetchLatestDraw", () => {
  it("maps the row to a DrawRow and hands the frozen card through untouched", async () => {
    // The jsonb snapshot IS the record — the copy it was taken from can be
    // melted an hour later. Reshaping it here (or re-resolving anything on
    // it) would quietly rewrite history, so it passes through by reference.
    const card = frozen();
    const supabase = drawSupabase({ weekly_draws: { data: drawDbRow({ card }) } });

    const latest = await fetchLatestDraw(supabase, "S5");

    expect(latest).toEqual({
      season: "S5",
      weekStart: "2026-08-24",
      discordId: "42",
      card,
      pot: 250,
      drawnAt: "2026-08-25T13:00:00.000Z",
    });
    expect(latest?.card).toBe(card);
  });

  it("asks for the newest week of this season only", async () => {
    const captured = capture();
    await fetchLatestDraw(drawSupabase({ weekly_draws: { data: null } }, captured), "S5");

    expect(captured.eqs).toContainEqual({ table: "weekly_draws", column: "season", value: "S5" });
    expect(captured.orders).toContainEqual({ column: "week_start", ascending: false });
  });

  it("returns null before the first draw", async () => {
    expect(await fetchLatestDraw(drawSupabase({ weekly_draws: { data: null } }), "S5")).toBeNull();
  });

  it("returns null when the table is not there yet rather than throwing at the page", async () => {
    // The panel is garnish on a page full of cards: an environment without
    // the weekly_draw migration must render the hub, not a 500.
    const supabase = drawSupabase({ weekly_draws: { error: { message: "relation does not exist" } } });

    expect(await fetchLatestDraw(supabase, "S5")).toBeNull();
  });

  it("reads a bigint pot back as a number", async () => {
    // pot is a bigint column; PostgREST can hand it back as a string, and a
    // string pot would render "250" fine and then concatenate somewhere.
    const supabase = drawSupabase({ weekly_draws: { data: drawDbRow({ pot: "250" }) } });

    expect((await fetchLatestDraw(supabase, "S5"))?.pot).toBe(250);
  });
});

describe("fetchDrawHistory", () => {
  it("maps every week, newest first", async () => {
    const captured = capture();
    const supabase = drawSupabase(
      {
        weekly_draws: {
          data: [drawDbRow(), drawDbRow({ week_start: "2026-08-17", discord_id: "99", pot: 250 })],
        },
      },
      captured,
    );

    const history = await fetchDrawHistory(supabase, "S5");

    expect(history.map((row) => row.weekStart)).toEqual(["2026-08-24", "2026-08-17"]);
    expect(history.map((row) => row.discordId)).toEqual(["42", "99"]);
    expect(captured.orders).toContainEqual({ column: "week_start", ascending: false });
  });

  it("returns an empty history rather than throwing when the table is missing", async () => {
    const supabase = drawSupabase({ weekly_draws: { error: { message: "relation does not exist" } } });

    expect(await fetchDrawHistory(supabase, "S5")).toEqual([]);
  });

  it("returns empty for a season that has never been drawn", async () => {
    expect(await fetchDrawHistory(drawSupabase({ weekly_draws: { data: [] } }), "S5")).toEqual([]);
  });
});

describe("fetchTicketCount", () => {
  it("counts the copies this collector holds in the season — every copy is a ticket", async () => {
    const captured = capture();
    const supabase = drawSupabase({ card_inventory: { data: null, count: 7 } }, captured);

    expect(await fetchTicketCount(supabase, "42", "S5")).toBe(7);
    expect(captured.eqs).toContainEqual({ table: "card_inventory", column: "discord_id", value: "42" });
    expect(captured.eqs).toContainEqual({ table: "card_inventory", column: "season", value: "S5" });
  });

  it("counts head-only, never dragging the whole collection back", async () => {
    const captured = capture();
    await fetchTicketCount(drawSupabase({ card_inventory: { count: 0 } }, captured), "42", "S5");

    expect(captured.selects).toContainEqual({
      table: "card_inventory",
      columns: "id",
      options: { count: "exact", head: true },
    });
  });

  it("reads zero tickets when the count fails", async () => {
    const supabase = drawSupabase({ card_inventory: { error: { message: "nope" } } });

    expect(await fetchTicketCount(supabase, "42", "S5")).toBe(0);
  });
});

describe("drawPanelState", () => {
  const latest = {
    season: "S5",
    weekStart: "2026-08-24",
    discordId: "42",
    card: frozen(),
    pot: 250,
    drawnAt: "2026-08-25T13:00:00.000Z",
  };

  it("says the first winner is coming when nothing has been drawn", () => {
    expect(drawPanelState(null, "42")).toEqual({
      headline: "No draws yet — the first winner is one Tuesday away.",
      isWinner: false,
    });
  });

  it("still says that to a signed-out visitor", () => {
    expect(drawPanelState(null, null)).toEqual({
      headline: "No draws yet — the first winner is one Tuesday away.",
      isWinner: false,
    });
  });

  it("names the card as yours when you hold the winning copy", () => {
    const state = drawPanelState(latest, "42");

    expect(state.isWinner).toBe(true);
    expect(state.headline).toContain("Your 7gen");
  });

  it("names the card without claiming it when someone else holds it", () => {
    const state = drawPanelState(latest, "99");

    expect(state.isWinner).toBe(false);
    expect(state.headline).toContain("7gen");
    expect(state.headline).not.toContain("Your");
  });

  it("never claims a win for a signed-out visitor", () => {
    // The viewer id is null signed out; a loose equality check would make
    // every signed-out visitor the winner of every draw.
    const state = drawPanelState({ ...latest, discordId: "" }, null);

    expect(state.isWinner).toBe(false);
  });

  it("keeps the game's one sentence in one place", () => {
    // Both surfaces print these; a second copy of either is how the panel
    // and the history page start disagreeing about the game.
    expect(DRAW_TAGLINE).toBe("One card wins every week — is it yours?");
    expect(DRAW_EMPTY_HEADLINE).toBe("No draws yet — the first winner is one Tuesday away.");
  });
});
