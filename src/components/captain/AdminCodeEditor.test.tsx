import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FixtureRow } from "@/lib/schedule/types";
import AdminCodeEditor from "./AdminCodeEditor";

const { importer } = vi.hoisted(() => ({
  importer: vi.fn((props: unknown) => {
    void props;
    return <section>Bulk code importer</section>;
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("./AdminCodeImporter", () => ({
  default: (props: unknown) => importer(props),
}));

const fixtures: FixtureRow[] = [{
  id: "fixture-1",
  season: "S5",
  stage: "week_1",
  division: null,
  team_a: "Team A",
  team_b: "Team B",
  scheduled_at: null,
  best_of: 3,
  score_a: null,
  score_b: null,
  sort_order: 0,
  created_at: "2026-08-16T00:00:00Z",
}];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminCodeEditor bulk importer scope", () => {
  it("omits the bulk importer when the captain surface is not Premier", () => {
    render(<AdminCodeEditor fixtures={fixtures} teams={[]} codes={[]} enableBulkImporter={false} />);

    fireEvent.click(screen.getByRole("button", { name: /admin — tourney codes/i }));

    expect(screen.queryByText("Bulk code importer")).toBeNull();
    expect(importer).not.toHaveBeenCalled();
  });

  it("renders the bulk importer when explicitly enabled for Premier", () => {
    render(<AdminCodeEditor fixtures={fixtures} teams={[]} codes={[]} enableBulkImporter />);

    fireEvent.click(screen.getByRole("button", { name: /admin — tourney codes/i }));

    expect(screen.getByText("Bulk code importer")).toBeTruthy();
    expect(importer).toHaveBeenCalledWith({ fixtures, season: "S5" });
  });
});
