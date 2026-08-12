import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HiddenCoin from "./HiddenCoin";

const getUser = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser },
    rpc,
  }),
}));

afterEach(() => {
  cleanup();
  getUser.mockReset();
  rpc.mockReset();
});

describe("HiddenCoin", () => {
  it("prompts signed-out finders to sign in instead of claiming", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    render(<HiddenCoin />);

    fireEvent.click(screen.getByRole("button"));

    expect(await screen.findByText(/sign in/i)).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("claims via claim_coin and shows the finder's placement", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: 2, error: null });
    render(<HiddenCoin />);

    fireEvent.click(screen.getByRole("button"));

    expect(await screen.findByText(/finder #2/i)).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith("claim_coin");
  });

  it("shows a retry message when the claim fails", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    render(<HiddenCoin />);

    fireEvent.click(screen.getByRole("button"));

    expect(await screen.findByText(/try again/i)).toBeTruthy();
  });
});
