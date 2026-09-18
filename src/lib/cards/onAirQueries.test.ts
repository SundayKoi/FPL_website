import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

// onAirQueries is `import "server-only"` — vitest resolves that package's
// default export condition (which throws by design) rather than the
// "react-server" one Next's bundler uses. Stub it so the module can load.
vi.mock("server-only", () => ({}));

const { countOnAirThisSeason, fetchOnAirCasters, fetchOnAirDesk } = await import("./onAirQueries");

/** A chainable, awaitable PostgREST stand-in: every builder settles to the
 *  reply this table was given, and records the filters it was handed. */
function client(replies: Record<string, { data?: unknown; error?: unknown }>) {
  const calls: { table: string; columns?: string; filters: Record<string, unknown> }[] = [];
  const from = vi.fn((table: string) => {
    const call = { table, columns: undefined as string | undefined, filters: {} as Record<string, unknown> };
    calls.push(call);
    const settle = () => {
      const reply = replies[table] ?? {};
      return { data: reply.data ?? null, error: reply.error ?? null };
    };
    const builder: Record<string, unknown> = {
      select: (columns?: string) => {
        call.columns = columns;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        call.filters[column] = value;
        return builder;
      },
      not: (column: string) => {
        call.filters[`not:${column}`] = true;
        return builder;
      },
      order: () => builder,
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(settle()).then(resolve, reject),
    };
    return builder;
  });
  return { supabase: { from } as unknown as SupabaseClient, calls };
}

const broadcasters = [
  { id: "a", display_name: "Static" },
  { id: "b", display_name: "Mixdown" },
  // A profile with no name cannot print a card with a name on it.
  { id: "c", display_name: null },
];

describe("fetchOnAirDesk", () => {
  it("puts a broadcaster with no settings row on the defaults, in the pool", async () => {
    const { supabase, calls } = client({
      profiles: { data: broadcasters },
      on_air_casters: { data: [] },
    });

    const desk = await fetchOnAirDesk(supabase);

    expect(calls[0].filters).toMatchObject({ is_broadcaster: true });
    expect(desk).toEqual([
      { caster: { profileId: "a", name: "Static", champion: null, skin: 0, roleLabel: "Caster", tagline: null }, active: true, hasRow: false },
      { caster: { profileId: "b", name: "Mixdown", champion: null, skin: 0, roleLabel: "Caster", tagline: null }, active: true, hasRow: false },
    ]);
  });

  it("carries a saved row through, and keeps a switched-off caster on the desk", async () => {
    const { supabase } = client({
      profiles: { data: broadcasters },
      on_air_casters: {
        data: [
          { profile_id: "a", champion: "Bard", skin: 3, role_label: "Play-by-play", tagline: "Chimes on the three.", active: true },
          { profile_id: "b", champion: "  ", skin: null, role_label: null, tagline: "  ", active: false },
        ],
      },
    });

    const desk = await fetchOnAirDesk(supabase);

    expect(desk[0]).toEqual({
      caster: { profileId: "a", name: "Static", champion: "Bard", skin: 3, roleLabel: "Play-by-play", tagline: "Chimes on the three." },
      active: true,
      hasRow: true,
    });
    // Blank is no signal, not an empty string, wherever it is read.
    expect(desk[1].caster).toMatchObject({ champion: null, skin: 0, roleLabel: "Caster", tagline: null });
    expect(desk[1].active).toBe(false);
  });

  it("is empty rather than loud when the tables are not there", async () => {
    const { supabase } = client({ profiles: { error: { message: "relation does not exist" } } });
    expect(await fetchOnAirDesk(supabase)).toEqual([]);
  });
});

describe("fetchOnAirCasters", () => {
  it("is the desk minus anyone switched off", async () => {
    const { supabase } = client({
      profiles: { data: broadcasters },
      on_air_casters: { data: [{ profile_id: "b", champion: "Ahri", skin: 7, role_label: "Colour", tagline: null, active: false }] },
    });

    expect((await fetchOnAirCasters(supabase)).map((caster) => caster.profileId)).toEqual(["a"]);
  });
});

describe("countOnAirThisSeason", () => {
  it("tallies the season's copies by caster", async () => {
    const { supabase, calls } = client({
      card_inventory: { data: [{ profileId: "a" }, { profileId: "b" }, { profileId: "a" }, { profileId: null }] },
    });

    expect(await countOnAirThisSeason(supabase, "S5")).toEqual({ a: 2, b: 1 });
    expect(calls[0].filters).toMatchObject({ season: "S5", "not:card->onAir": true });
  });

  it("counts nothing rather than throwing when the read fails", async () => {
    const { supabase } = client({ card_inventory: { error: { message: "nope" } } });
    expect(await countOnAirThisSeason(supabase, "S5")).toEqual({});
  });
});
