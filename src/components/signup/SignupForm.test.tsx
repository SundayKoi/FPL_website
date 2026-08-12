import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RANK_OPTIONS } from "@/lib/signup/ranks";
import SignupForm, { signupPayload, validateSignup } from "./SignupForm";

const insert = vi.fn(async () => ({ error: null }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: vi.fn(() => ({ insert })),
  }),
}));

afterEach(() => {
  cleanup();
  insert.mockClear();
});

const VALID = {
  discord: "gratxace6488",
  riotId: "GratxAce#NA1",
  opgg: "https://op.gg/lol/summoners/na/GratxAce-NA1",
  playerStatus: "returning",
  currentRank: "Diamond 4",
  peakRank: "Diamond 1",
  primaryRole: "adc",
  secondaryRole: "mid",
  captainInterest: "no",
} as const;

describe("validateSignup", () => {
  it("accepts a complete form", () => {
    expect(validateSignup({ ...VALID })).toBeNull();
  });

  it("requires a tagged Riot ID", () => {
    expect(validateSignup({ ...VALID, riotId: "GratxAce" })).toMatch(/tag/i);
  });

  it("requires the new-or-returning answer", () => {
    expect(validateSignup({ ...VALID, playerStatus: "" })).toMatch(/new or returning/i);
  });

  it("requires both rank answers and the captain answer", () => {
    expect(validateSignup({ ...VALID, currentRank: "" })).toMatch(/current rank/i);
    expect(validateSignup({ ...VALID, peakRank: "" })).toMatch(/last two seasons/i);
    expect(validateSignup({ ...VALID, captainInterest: "" })).toMatch(/captain/i);
  });
});

describe("signupPayload", () => {
  it("maps the form to the signups row shape, stamping the season", () => {
    expect(signupPayload({ ...VALID }, "S5")).toEqual({
      season: "S5",
      discord: "gratxace6488",
      riot_id: "GratxAce#NA1",
      opgg: "https://op.gg/lol/summoners/na/GratxAce-NA1",
      player_status: "returning",
      current_rank: "Diamond 4",
      peak_rank: "Diamond 1",
      primary_role: "adc",
      secondary_role: "mid",
      captain_interest: false,
    });
  });

  it("drops a secondary role that duplicates the primary", () => {
    const payload = signupPayload({ ...VALID, secondaryRole: "adc" }, "S5");
    expect(payload.secondary_role).toBeNull();
  });
});

describe("SignupForm", () => {
  it("asks the reworded season-agnostic peak question and the new/returning question", () => {
    render(<SignupForm season="S5" />);
    expect(screen.getByText(/peak rank in the last two seasons/i)).toBeTruthy();
    expect(screen.getByText(/new or returning player/i)).toBeTruthy();
    // No hardcoded season numbers anywhere in the question set.
    expect(screen.queryByText(/season\s*2[56]/i)).toBeNull();
  });

  it("offers uniform rank options instead of free text", () => {
    render(<SignupForm season="S5" />);
    const currentRank = screen.getByLabelText(/current rank/i) as HTMLSelectElement;
    // "Select…" placeholder + every rank option.
    expect(currentRank.options.length).toBe(RANK_OPTIONS.length + 1);
  });

  it("blocks submit with a visible error instead of inserting when invalid", () => {
    render(<SignupForm season="S5" />);
    fireEvent.click(screen.getByRole("button", { name: /sign up for s5/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/discord/i);
    expect(insert).not.toHaveBeenCalled();
  });

  it("inserts the payload and shows the success state", async () => {
    render(<SignupForm season="S5" />);
    fireEvent.change(screen.getByLabelText(/discord username/i), {
      target: { value: VALID.discord },
    });
    fireEvent.change(screen.getByLabelText(/riot id/i), { target: { value: VALID.riotId } });
    fireEvent.change(screen.getByLabelText(/op\.gg link/i), { target: { value: VALID.opgg } });
    fireEvent.change(screen.getByLabelText(/new or returning/i), {
      target: { value: "returning" },
    });
    fireEvent.change(screen.getByLabelText(/current rank/i), {
      target: { value: VALID.currentRank },
    });
    fireEvent.change(screen.getByLabelText(/peak rank/i), { target: { value: VALID.peakRank } });
    fireEvent.change(screen.getByLabelText(/primary role/i), {
      target: { value: VALID.primaryRole },
    });
    fireEvent.change(screen.getByLabelText(/captain/i), { target: { value: "no" } });

    fireEvent.click(screen.getByRole("button", { name: /sign up for s5/i }));

    expect(await screen.findByText(/you're signed up/i)).toBeTruthy();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ season: "S5", player_status: "returning", captain_interest: false }),
    );
  });
});
