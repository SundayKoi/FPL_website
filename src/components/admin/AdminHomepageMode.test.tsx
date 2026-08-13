import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminHomepageMode from "./AdminHomepageMode";

const { upsert, refresh } = vi.hoisted(() => ({
  upsert: vi.fn().mockResolvedValue({ error: null }),
  refresh: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: vi.fn(() => ({ upsert })) }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  cleanup();
  upsert.mockClear();
  upsert.mockResolvedValue({ error: null });
  refresh.mockClear();
});

describe("AdminHomepageMode", () => {
  it("persists the selected homepage and refreshes the site", async () => {
    render(<AdminHomepageMode homepageMode="auto" />);

    fireEvent.click(screen.getByRole("button", { name: "Regular season" }));

    await waitFor(() => {
      expect(upsert).toHaveBeenCalledWith({
        id: 1,
        homepage_mode: "regular",
        updated_at: expect.any(String),
      });
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("shows the automatic mode as the default fallback", () => {
    render(<AdminHomepageMode homepageMode="auto" />);

    expect(screen.getByRole("button", { name: "Automatic" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/follows the calendar/i)).not.toBeNull();
  });
});
