import { afterEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: createServerSupabaseMock }));

import { render, screen } from "@testing-library/react";
import ActivePatrons from "./ActivePatrons";

function mockPatronRead(result: unknown) {
  createServerSupabaseMock.mockResolvedValue({
    from: (table: string) => ({
      select: (columns: string) => ({
        order: async () => {
          expect(table).toBe("patrons_public");
          expect(columns).toBe("username, avatar_url, patron_until, patron_flame");
          return result;
        },
      }),
    }),
  } as never);
}

afterEach(() => vi.restoreAllMocks());

describe("ActivePatrons", () => {
  it("distinguishes a failed read from an empty public list", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockPatronRead({ data: null, error: { message: "read failed" } });
    const failedRead = render(await ActivePatrons());
    expect(screen.getByRole("status").textContent).toMatch(/temporarily unavailable/i);
    failedRead.unmount();

    mockPatronRead({ data: [], error: null });
    render(await ActivePatrons());
    expect(screen.getByText(/no active patrons are listed right now/i)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders only the public patron identity and month label", async () => {
    mockPatronRead({
      data: [{ username: "VisibleName", avatar_url: null, patron_until: "2026-09-30T00:00:00Z", patron_flame: "ember" }],
      error: null,
    });
    render(await ActivePatrons());

    expect(screen.getByText("VisibleName")).toBeTruthy();
    expect(screen.getByText("Patron through Sep 2026")).toBeTruthy();
    expect(screen.getByLabelText("Active patrons")).toBeTruthy();
  });
});
