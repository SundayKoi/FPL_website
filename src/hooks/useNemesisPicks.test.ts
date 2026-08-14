import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNemesisPicks } from "./useNemesisPicks";

const { from, channel, on, subscribe, removeChannel, order, eq, select } = vi.hoisted(() => {
  const on = vi.fn();
  const subscribe = vi.fn();
  const order = vi.fn();
  const eq = vi.fn();
  const select = vi.fn();
  return {
    from: vi.fn(),
    channel: vi.fn(),
    on,
    subscribe,
    removeChannel: vi.fn(),
    order,
    eq,
    select,
  };
});

const rows = [
  {
    id: "p0", draft_id: "d1", pick_number: 0, chooser_team_id: null,
    chosen_team_id: "a", division: "Lunari", created_at: "2026-08-14T00:00:00Z",
  },
];

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from, channel, removeChannel }),
}));

select.mockReturnValue({ eq });
eq.mockReturnValue({ order });
order.mockResolvedValue({ data: rows });
from.mockReturnValue({ select });
on.mockReturnValue({ on, subscribe });
channel.mockReturnValue({ on, subscribe });

afterEach(() => {
  subscribe.mockReset();
  vi.clearAllMocks();
  select.mockReturnValue({ eq });
  eq.mockReturnValue({ order });
  order.mockResolvedValue({ data: rows });
  from.mockReturnValue({ select });
  on.mockReturnValue({ on, subscribe });
  channel.mockReturnValue({ on, subscribe });
});

describe("useNemesisPicks", () => {
  it("loads picks once the channel subscribes", async () => {
    subscribe.mockImplementation((cb: (status: string) => void) => {
      cb("SUBSCRIBED");
      return { on, subscribe };
    });

    const { result } = renderHook(() => useNemesisPicks("d1"));

    await waitFor(() => expect(result.current.picks).toHaveLength(1));
    expect(from).toHaveBeenCalledWith("nemesis_picks");
    expect(channel).toHaveBeenCalledWith("nemesis:d1");
  });

  it("does not fetch or load picks until the channel reports SUBSCRIBED", async () => {
    // Deliberately never invokes the subscribe callback, so a correct hook
    // never calls refetch. Asserting synchronously right after render would
    // pass trivially even for a buggy hook that refetches unconditionally —
    // the state update just hasn't flushed yet. Flushing microtasks first
    // (via act) and then asserting the query builder was never touched makes
    // this a real check of "nothing loads before SUBSCRIBED", not a timing
    // artifact.
    subscribe.mockImplementation(() => ({ on, subscribe }));

    const { result } = renderHook(() => useNemesisPicks("d1"));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(select).not.toHaveBeenCalled();
    expect(result.current.picks).toEqual([]);
  });
});
