import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminFeaturedMatchupEditor from "./AdminFeaturedMatchupEditor";

const { from, upsert, refresh } = vi.hoisted(() => {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  return {
    from: vi.fn(() => ({ upsert })),
    upsert,
    refresh: vi.fn(),
  };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const fixtures = [
  { id: "fixture-1", label: "Solari · Alpha vs Beta" },
  { id: "fixture-2", label: "Lunari · Gamma vs Delta" },
];

afterEach(() => {
  cleanup();
  from.mockReturnValue({ upsert });
  upsert.mockReset();
  upsert.mockResolvedValue({ error: null });
  refresh.mockReset();
});

describe("AdminFeaturedMatchupEditor", () => {
  it("starts collapsed and reveals its editable fields when opened", () => {
    render(
      <AdminFeaturedMatchupEditor
        homepage="premier"
        fixtures={fixtures}
        settings={{ fixtureId: "fixture-1", title: "Premier feature", description: "Premier copy" }}
      />,
    );

    const heading = screen.getByRole("heading", { name: "Premier featured matchup" });
    const disclosure = heading.closest("details");
    expect(disclosure).not.toBeNull();
    expect(disclosure?.open).toBe(false);

    fireEvent.click(heading);

    expect(disclosure?.open).toBe(true);
    expect(screen.getByLabelText("Premier title")).not.toBeNull();
  });

  it("renders independent Premier and Academy fixture and copy controls", () => {
    render(
      <>
        <AdminFeaturedMatchupEditor
          homepage="premier"
          fixtures={fixtures}
          settings={{ fixtureId: "fixture-1", title: "Premier feature", description: "Premier copy" }}
        />
        <AdminFeaturedMatchupEditor
          homepage="academy"
          fixtures={fixtures}
          settings={{ fixtureId: "fixture-2", title: "Academy feature", description: "Academy copy" }}
        />
      </>,
    );

    fireEvent.click(screen.getByRole("heading", { name: "Premier featured matchup" }));
    fireEvent.click(screen.getByRole("heading", { name: "Academy featured matchup" }));

    expect(screen.getByRole("heading", { name: "Premier featured matchup" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Academy featured matchup" })).not.toBeNull();
    expect((screen.getByLabelText("Premier fixture") as HTMLSelectElement).value).toBe("fixture-1");
    expect((screen.getByLabelText("Academy fixture") as HTMLSelectElement).value).toBe("fixture-2");
    expect((screen.getByLabelText("Premier title") as HTMLInputElement).value).toBe("Premier feature");
    expect((screen.getByLabelText("Academy title") as HTMLInputElement).value).toBe("Academy feature");
    expect((screen.getByLabelText("Premier description") as HTMLTextAreaElement).value).toBe("Premier copy");
    expect((screen.getByLabelText("Academy description") as HTMLTextAreaElement).value).toBe("Academy copy");
  });

  it("saves the edited Premier settings to its scoped row and refreshes", async () => {
    render(
      <AdminFeaturedMatchupEditor
        homepage="premier"
        fixtures={fixtures}
        settings={{ fixtureId: null, title: null, description: null }}
      />,
    );

    fireEvent.click(screen.getByRole("heading", { name: "Premier featured matchup" }));

    fireEvent.change(screen.getByLabelText("Premier fixture"), { target: { value: "fixture-2" } });
    fireEvent.change(screen.getByLabelText("Premier title"), { target: { value: "  Week 4 showdown  " } });
    fireEvent.change(screen.getByLabelText("Premier description"), { target: { value: "  A key series.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save Premier featured matchup" }));

    await waitFor(() => {
      expect(from).toHaveBeenCalledWith("homepage_featured_settings");
      expect(upsert).toHaveBeenCalledWith(
        {
          homepage: "premier",
          fixture_id: "fixture-2",
          title: "Week 4 showdown",
          description: "A key series.",
          updated_at: expect.any(String),
        },
        { onConflict: "homepage" },
      );
      expect(screen.getByText("Saved.")).not.toBeNull();
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  it("saves Academy settings to the Academy row and refreshes", async () => {
    render(
      <AdminFeaturedMatchupEditor
        homepage="academy"
        fixtures={fixtures}
        settings={{ fixtureId: null, title: null, description: null }}
      />,
    );

    fireEvent.click(screen.getByRole("heading", { name: "Academy featured matchup" }));

    fireEvent.change(screen.getByLabelText("Academy fixture"), { target: { value: "fixture-1" } });
    fireEvent.change(screen.getByLabelText("Academy title"), { target: { value: "Academy showcase" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Academy featured matchup" }));

    await waitFor(() => {
      expect(upsert).toHaveBeenCalledWith(
        {
          homepage: "academy",
          fixture_id: "fixture-1",
          title: "Academy showcase",
          description: null,
          updated_at: expect.any(String),
        },
        { onConflict: "homepage" },
      );
      expect(screen.getByText("Saved.")).not.toBeNull();
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  it("shows a save error without refreshing the page", async () => {
    upsert.mockResolvedValue({ error: { message: "You do not have permission to save this matchup." } });

    render(
      <AdminFeaturedMatchupEditor
        homepage="academy"
        fixtures={fixtures}
        settings={{ fixtureId: null, title: null, description: null }}
      />,
    );

    fireEvent.click(screen.getByRole("heading", { name: "Academy featured matchup" }));

    fireEvent.click(screen.getByRole("button", { name: "Save Academy featured matchup" }));

    expect((await screen.findByRole("alert")).textContent).toContain("You do not have permission to save this matchup.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows thrown request errors and re-enables saving", async () => {
    upsert.mockRejectedValue(new Error("The connection was interrupted."));

    render(
      <AdminFeaturedMatchupEditor
        homepage="academy"
        fixtures={fixtures}
        settings={{ fixtureId: null, title: null, description: null }}
      />,
    );

    fireEvent.click(screen.getByRole("heading", { name: "Academy featured matchup" }));

    const saveButton = screen.getByRole("button", { name: "Save Academy featured matchup" });
    fireEvent.click(saveButton);

    expect((await screen.findByRole("alert")).textContent).toContain("The connection was interrupted.");
    expect(saveButton.hasAttribute("disabled")).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });
});
