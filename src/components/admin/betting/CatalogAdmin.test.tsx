import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { upsertEvent } = vi.hoisted(() => ({ upsertEvent: vi.fn() }));
vi.mock("@/lib/betting/admin-actions", () => ({
  upsertEvent,
  upsertTeam: vi.fn(),
  deleteTeam: vi.fn(),
  deleteEvent: vi.fn(),
  upsertStoreItem: vi.fn(),
  deleteStoreItem: vi.fn(),
}));

vi.mock("./useAdminRun", () => ({
  ErrorBanner: () => null,
  useAdminRun: () => ({
    error: null,
    pending: false,
    run: (action: () => Promise<{ ok: boolean }>, onSuccess?: () => void) => {
      void action().then((result) => {
        if (result.ok) onSuccess?.();
      });
    },
  }),
}));

import CatalogAdmin from "./CatalogAdmin";

afterEach(() => {
  cleanup();
  upsertEvent.mockReset().mockResolvedValue({ ok: true, id: 9 });
});

const events = [
  { id: 1, name: "Premier Automation", description: null, league: "premier" as const, schedule_season: "S5" },
  { id: 2, name: "Legacy Props", description: null, league: null, schedule_season: null },
];

describe("CatalogAdmin event schedule bindings", () => {
  it("shows schedule binding state for existing events", () => {
    render(<CatalogAdmin teams={[]} events={events} storeItems={[]} />);

    expect(screen.getByText("Premier · S5")).toBeTruthy();
    expect(screen.getByText("Not linked to the schedule")).toBeTruthy();
  });

  it("creates an event with the selected league and season", async () => {
    render(<CatalogAdmin teams={[]} events={[]} storeItems={[]} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Event name" }), { target: { value: "Academy A1" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Schedule league" }), { target: { value: "academy" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Schedule season" }), { target: { value: "A1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add event" }));

    await waitFor(() => expect(upsertEvent).toHaveBeenCalledWith({
      name: "Academy A1",
      league: "academy",
      scheduleSeason: "A1",
    }));
  });

  it("can clear an existing event's schedule binding", async () => {
    render(<CatalogAdmin teams={[]} events={events} storeItems={[]} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Edit schedule binding" })[0]);
    fireEvent.change(screen.getByRole("combobox", { name: "Schedule league for Premier Automation" }), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save schedule binding" }));

    await waitFor(() => expect(upsertEvent).toHaveBeenCalledWith({
      id: 1,
      name: "Premier Automation",
      league: null,
      scheduleSeason: null,
    }));
  });
});
