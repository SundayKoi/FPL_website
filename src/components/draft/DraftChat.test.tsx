import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rows = [
  { id: 1, profile_id: "u1", body: "glhf 🔥", created_at: "2026-08-14T00:00:00Z" },
  { id: 2, profile_id: null, body: "⏭️ Team B skipped — can't open a 10-point lot this round", created_at: "2026-08-14T00:00:01Z" },
];

const rpc = vi.fn(async () => ({ data: 3, error: null }));

function chainable(result: unknown) {
  const target: Record<string, unknown> = {};
  const proxy: Record<string, unknown> = new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
      }
      return () => proxy;
    },
  });
  return proxy;
}

const from = vi.fn((table: string) => {
  if (table === "draft_chat") return chainable({ data: [...rows].reverse(), error: null });
  if (table === "profiles") return chainable({ data: [{ id: "u1", display_name: "Caster" }], error: null });
  return chainable({ data: [], error: null });
});

const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from, rpc, channel: () => channel, removeChannel: vi.fn() }),
}));

import DraftChat from "./DraftChat";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  rpc.mockClear();
  from.mockClear();
});

describe("DraftChat", () => {
  it("renders messages with author names and centered system lines", async () => {
    render(<DraftChat draftId="d1" profileId="u1" isAdmin={false} />);

    expect(await screen.findByText("glhf 🔥")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Caster")).toBeTruthy());
    const system = screen.getByText(/Team B skipped/);
    expect(system.className).toContain("text-center");
  });

  it("shows a sign-in note instead of the composer when signed out", async () => {
    render(<DraftChat draftId="d1" profileId={null} isAdmin={false} />);

    expect(await screen.findByText(/sign in to join the chat/i)).toBeTruthy();
    expect(screen.queryByLabelText("Chat message")).toBeNull();
  });

  it("sends via the rate-limited RPC and clears the input", async () => {
    render(<DraftChat draftId="d1" profileId="u1" isAdmin={false} />);

    const input = (await screen.findByLabelText("Chat message")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "LETS GO" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    });

    expect(rpc).toHaveBeenCalledWith("post_draft_chat", { p_draft_id: "d1", p_body: "LETS GO" });
    expect(input.value).toBe("");
  });

  it("appends quick emoji to the draft message", async () => {
    render(<DraftChat draftId="d1" profileId="u1" isAdmin={false} />);

    const input = (await screen.findByLabelText("Chat message")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "clip that " } });
    fireEvent.click(screen.getByRole("button", { name: "Add 🤡" }));

    expect(input.value).toBe("clip that 🤡");
  });

  it("offers the league's quick-pick emoji, including multi-codepoint ones", async () => {
    render(<DraftChat draftId="d1" profileId="u1" isAdmin={false} />);

    // 🗣️ carries a variation selector and 🇮🇱 is a regional-indicator pair, so
    // both are easy to mangle when the list is edited.
    for (const emoji of ["♿", "🫃", "🗣️", "💣", "❓", "🤡", "🇮🇱", "🔥", "💀", "😭", "👎"]) {
      expect(await screen.findByRole("button", { name: `Add ${emoji}` })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Add 🔥" }).parentElement?.className).toContain("flex-wrap");
  });

  it("surfaces the rate-limit error as friendly copy", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "TOO_FAST: slow down a little" } } as never);
    render(<DraftChat draftId="d1" profileId="u1" isAdmin={false} />);

    const input = (await screen.findByLabelText("Chat message")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "spam" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    });

    expect(await screen.findByText(/one message every couple of seconds/i)).toBeTruthy();
  });
});
