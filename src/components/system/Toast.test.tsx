import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./Toast";

function Trigger({ message, tone }: { message: string; tone?: "success" | "error" }) {
  const { notify } = useToast();
  return (
    <button type="button" onClick={() => notify(message, { tone })}>
      go
    </button>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Toast", () => {
  it("shows a confirmation, announces it, and lets it go after a while", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger message="Bought Doug for $120" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    expect(screen.getByRole("status").textContent).toContain("Bought Doug for $120");
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("marks an error as an alert and can be dismissed by hand", () => {
    render(
      <ToastProvider>
        <Trigger message="That listing is gone." tone="error" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    expect(screen.getByRole("alert").textContent).toContain("That listing is gone.");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("is a no-op without a provider, so any component can call it", () => {
    render(<Trigger message="nothing" />);
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
