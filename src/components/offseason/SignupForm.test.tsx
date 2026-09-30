import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { signUpAction, withdrawAction } = vi.hoisted(() => ({ signUpAction: vi.fn(), withdrawAction: vi.fn() }));
vi.mock("@/lib/offseason/actions", () => ({ signUpAction, withdrawAction }));

import OffseasonSignupForm, { validateOffseasonSignup } from "./SignupForm";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const valid = { displayName: "Pat", riotId: "Pat Doe#NA1", opggUrl: "", currentRank: "Gold 2", primaryRole: "mid" as const, secondaryRole: "" as const };

describe("validateOffseasonSignup", () => {
  it("accepts a complete form", () => {
    expect(validateOffseasonSignup(valid)).toBeNull();
  });

  it("names the first problem", () => {
    expect(validateOffseasonSignup({ ...valid, displayName: " " })).toMatch(/name/i);
    expect(validateOffseasonSignup({ ...valid, riotId: "NoTag" })).toMatch(/Name#TAG/);
    expect(validateOffseasonSignup({ ...valid, currentRank: "" })).toMatch(/rank/i);
    expect(validateOffseasonSignup({ ...valid, primaryRole: "" })).toMatch(/primary/i);
  });
});

describe("OffseasonSignupForm", () => {
  function fill() {
    fireEvent.change(screen.getByLabelText(/^Riot ID/), { target: { value: "Pat Doe#NA1" } });
    fireEvent.change(screen.getByLabelText(/^Current rank/), { target: { value: "Gold 2" } });
    fireEvent.change(screen.getByLabelText(/^Primary role/), { target: { value: "mid" } });
    fireEvent.change(screen.getByLabelText(/^Secondary role/), { target: { value: "top" } });
  }

  it("sends the sign-up and confirms it", async () => {
    signUpAction.mockResolvedValue({ ok: true });
    render(<OffseasonSignupForm eventId="event-1" entry={null} defaultName="Pat" />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/signed up/i));
    expect(signUpAction).toHaveBeenCalledWith({
      eventId: "event-1",
      displayName: "Pat",
      riotId: "Pat Doe#NA1",
      opggUrl: "",
      currentRank: "Gold 2",
      primaryRole: "mid",
      secondaryRole: "top",
    });
  });

  it("shows the server's reason when the sign-up is refused", async () => {
    signUpAction.mockResolvedValue({ ok: false, error: "sign-ups are closed" });
    render(<OffseasonSignupForm eventId="event-1" entry={null} defaultName="Pat" />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("sign-ups are closed"));
  });

  it("checks the form before sending it", () => {
    render(<OffseasonSignupForm eventId="event-1" entry={null} defaultName="" />);
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(screen.getByRole("alert").textContent).toMatch(/name/i);
    expect(signUpAction).not.toHaveBeenCalled();
  });
});
