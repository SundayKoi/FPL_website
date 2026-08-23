import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteErrorState, RouteLoadingState } from "./RouteState";

afterEach(cleanup);

describe("RouteLoadingState", () => {
  it("provides an accessible page-loading announcement", () => {
    render(<RouteLoadingState />);

    expect(screen.getByRole("status").textContent).toMatch(/loading page/i);
  });
});

describe("RouteErrorState", () => {
  it("offers recovery without exposing the underlying error", () => {
    const onRetry = vi.fn();
    render(<RouteErrorState onRetry={onRetry} />);

    expect(screen.getByRole("heading", { name: /couldn.t load this page/i })).toBeTruthy();
    expect(screen.queryByText(/database password/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: /go home/i }).getAttribute("href")).toBe("/");
  });
});
