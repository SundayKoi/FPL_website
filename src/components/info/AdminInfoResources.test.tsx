import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminInfoResources, { type InfoResource } from "./AdminInfoResources";

const { update, refresh } = vi.hoisted(() => ({ update: vi.fn(), refresh: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => ({ update: () => ({ eq: update }) }) }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const resource: InfoResource = {
  id: "resource-1",
  slug: "payment",
  label: "Payment",
  description: "Pay league fees.",
  href: "https://example.com/payment",
  sort_order: 1,
};

describe("AdminInfoResources", () => {
  afterEach(() => {
    cleanup();
    update.mockReset();
    refresh.mockReset();
  });

  it("saves edited resource fields and refreshes the page", async () => {
    update.mockResolvedValue({ error: null });
    render(<AdminInfoResources resources={[resource]} />);

    expect(screen.queryByLabelText("Label")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit linked resources" }));
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Fees" } });
    fireEvent.click(screen.getByRole("button", { name: "Save resources" }));

    await waitFor(() => expect(update).toHaveBeenCalledWith("id", "resource-1"));
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Resources saved.");
  });
});
