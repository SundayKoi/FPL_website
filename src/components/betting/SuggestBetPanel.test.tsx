import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { suggestProp } = vi.hoisted(() => ({ suggestProp: vi.fn() }));
vi.mock("@/lib/betting/actions", () => ({ suggestProp }));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { SuggestBetPanel } from "./SuggestBetPanel";
import type { PropSuggestion } from "@/lib/betting/types";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  suggestProp.mockReset().mockResolvedValue({ ok: true });
  refresh.mockReset();
});

function openForm() {
  fireEvent.click(screen.getByRole("button", { name: /suggest a bet/i }));
}

describe("SuggestBetPanel", () => {
  it("keeps submit disabled until question and both sides are filled", () => {
    render(<SuggestBetPanel suggestions={[]} />);
    openForm();

    const submit = screen.getByRole("button", { name: /send suggestion/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/the question/i), { target: { value: "How much will Chime go for?" } });
    fireEvent.change(screen.getByLabelText(/side a/i), { target: { value: "Over 500" } });
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/side b/i), { target: { value: "Under 500" } });
    expect(submit.disabled).toBe(false);
  });

  it("submits the form values and refreshes on success", async () => {
    render(<SuggestBetPanel suggestions={[]} />);
    openForm();

    fireEvent.change(screen.getByLabelText(/the question/i), { target: { value: "How much will Chime go for?" } });
    fireEvent.change(screen.getByLabelText(/side a/i), { target: { value: "Over 500" } });
    fireEvent.change(screen.getByLabelText(/side b/i), { target: { value: "Under 500" } });
    fireEvent.click(screen.getByRole("button", { name: /send suggestion/i }));

    expect(await screen.findByText(/sent — staff will review it/i)).toBeTruthy();
    expect(suggestProp).toHaveBeenCalledWith("How much will Chime go for?", "Over 500", "Under 500", undefined);
    expect(refresh).toHaveBeenCalled();
  });

  it("surfaces a server error without clearing the form", async () => {
    suggestProp.mockResolvedValue({ ok: false, error: "You already have 3 suggestions waiting for review." });
    render(<SuggestBetPanel suggestions={[]} />);
    openForm();

    fireEvent.change(screen.getByLabelText(/the question/i), { target: { value: "How much will Chime go for?" } });
    fireEvent.change(screen.getByLabelText(/side a/i), { target: { value: "Over 500" } });
    fireEvent.change(screen.getByLabelText(/side b/i), { target: { value: "Under 500" } });
    fireEvent.click(screen.getByRole("button", { name: /send suggestion/i }));

    expect(await screen.findByText(/3 suggestions waiting/i)).toBeTruthy();
    expect((screen.getByLabelText(/the question/i) as HTMLInputElement).value).toBe(
      "How much will Chime go for?",
    );
  });

  it("lists the member's suggestions with status and rejection reason", () => {
    const suggestions: PropSuggestion[] = [
      {
        id: 1,
        question: "Will X carry?",
        side_a: "Yes",
        side_b: "No",
        note: null,
        status: "REJECTED",
        reason: "too ambiguous",
        market_id: null,
        created_at: "2026-08-14T00:00:00Z",
      },
      {
        id: 2,
        question: "Over 500 for Chime?",
        side_a: "Over",
        side_b: "Under",
        note: null,
        status: "APPROVED",
        reason: null,
        market_id: 9,
        created_at: "2026-08-14T00:00:00Z",
      },
    ];
    render(<SuggestBetPanel suggestions={suggestions} />);

    expect(screen.getByText("REJECTED")).toBeTruthy();
    expect(screen.getByText(/too ambiguous/)).toBeTruthy();
    expect(screen.getByText("APPROVED")).toBeTruthy();
  });
});
