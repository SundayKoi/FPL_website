import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConnectionBanner from "./ConnectionBanner";

afterEach(cleanup);

describe("ConnectionBanner", () => {
  it("stays out of the way while live updates are connected", () => {
    const { container } = render(<ConnectionBanner status="connected" onRetry={() => {}} />);

    expect(container.childElementCount).toBe(0);
  });

  it("announces the initial live connection without presenting a recovery action", () => {
    render(<ConnectionBanner status="connecting" onRetry={() => {}} />);

    expect(screen.getByRole("status").textContent).toMatch(/connecting to live updates/i);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("warns when live updates are interrupted and retries on request", () => {
    const onRetry = vi.fn();
    render(<ConnectionBanner status="reconnecting" onRetry={onRetry} />);

    expect(screen.getByRole("alert").textContent).toMatch(/live updates interrupted/i);
    fireEvent.click(screen.getByRole("button", { name: /retry now/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
