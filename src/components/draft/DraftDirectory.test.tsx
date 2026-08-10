import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Draft } from "@/lib/draft/types";
import DraftDirectory from "./DraftDirectory";

describe("DraftDirectory", () => {
  it("links each draft card to its existing board", () => {
    const draft = {
      id: "summer-auction",
      name: "Summer Auction",
      status: "live",
    } as Draft;

    render(<DraftDirectory drafts={[draft]} />);

    expect(screen.getByRole("heading", { name: "Draft Central", level: 1 })).toBeTruthy();
    expect(screen.getByRole("link", { name: /summer auction/i }).getAttribute("href")).toBe(
      "/draft/summer-auction",
    );
    expect(screen.getByText("live")).toBeTruthy();
  });
});
