import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FixtureRow } from "@/lib/schedule/types";
import AdminCodeImporter from "./AdminCodeImporter";

const { rpc, refresh } = vi.hoisted(() => ({
  rpc: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

function fixture(overrides: Partial<FixtureRow>): FixtureRow {
  return {
    id: crypto.randomUUID(),
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
    ...overrides,
  };
}

const fixtures: FixtureRow[] = [
  fixture({ id: "played", stage: "week_1", sort_order: 0, team_a: "Played A", team_b: "Played B", score_a: 2, score_b: 1 }),
  fixture({ id: "week-2", stage: "week_2", sort_order: 2, team_a: "Week 2 A", team_b: "Week 2 B" }),
  fixture({ id: "week-1", stage: "week_1", sort_order: 1, team_a: "Week 1 A", team_b: "Week 1 B" }),
];

async function uploadCodes(input: HTMLElement, text: string, name = "codes.csv") {
  const file = new File([text], name, { type: "text/csv" });
  fireEvent.change(input, { target: { files: [file] } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function deferredFile(promise: Promise<string>, name: string) {
  const file = new File([], name, { type: "text/csv" });
  const text = vi.fn(() => promise);
  Object.defineProperty(file, "text", { value: text });
  return { file, text };
}

afterEach(() => {
  cleanup();
  rpc.mockReset();
  refresh.mockReset();
});

describe("AdminCodeImporter", () => {
  it("renders a fixture preview, shows unused codes, and only saves after confirmation", async () => {
    rpc.mockResolvedValue({ data: 6, error: null });

    render(<AdminCodeImporter fixtures={fixtures} season="S5" />);

    await uploadCodes(screen.getByLabelText(/upload tournament code file/i), '"A1","A2","A3","B1","B2","B3","EXTRA1"');

    const preview = await screen.findByRole("table", { name: /import preview/i });
    const rows = within(preview).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText("Week 1")).toBeTruthy();
    expect(within(rows[1]).getByText("Week 1 A vs Week 1 B")).toBeTruthy();
    expect(within(rows[1]).getByText("A1, A2, A3")).toBeTruthy();
    expect(within(rows[2]).getByText("Week 2")).toBeTruthy();
    expect(within(rows[2]).getByText("Week 2 A vs Week 2 B")).toBeTruthy();
    expect(within(rows[2]).getByText("B1, B2, B3")).toBeTruthy();
    expect(screen.getByText(/1 unused code/i)).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /confirm import/i }));

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith("bulk_replace_match_codes", {
        p_season: "S5",
        p_fixture_ids: ["week-1", "week-2"],
        p_codes: ["A1", "A2", "A3", "B1", "B2", "B3", "EXTRA1"],
      });
      expect(refresh).toHaveBeenCalled();
    });

    expect(screen.getByText(/populated 2 fixtures with 6 codes/i)).toBeTruthy();
  });

  it("shows a validation error when the file does not contain enough codes", async () => {
    render(<AdminCodeImporter fixtures={fixtures} season="S5" />);

    await uploadCodes(screen.getByLabelText(/upload tournament code file/i), "A1,A2,A3,B1,B2");

    expect((await screen.findByRole("alert")).textContent).toContain("Need at least 6 tournament codes for 2 target fixtures.");
    expect(screen.queryByRole("table", { name: /import preview/i })).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps the preview visible when the bulk RPC fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "RPC failed" } });

    render(<AdminCodeImporter fixtures={fixtures} season="S5" />);

    await uploadCodes(screen.getByLabelText(/upload tournament code file/i), "A1,A2,A3,B1,B2,B3");

    expect(await screen.findByRole("table", { name: /import preview/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /confirm import/i }));

    expect((await screen.findByRole("alert")).textContent).toContain("RPC failed");
    expect(screen.getByRole("table", { name: /import preview/i })).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("retains the previous valid preview when a replacement upload fails validation", async () => {
    render(<AdminCodeImporter fixtures={fixtures} season="S5" />);

    const input = screen.getByLabelText(/upload tournament code file/i);

    await uploadCodes(input, "A1,A2,A3,B1,B2,B3");

    const preview = await screen.findByRole("table", { name: /import preview/i });
    expect(within(preview).getByText("Week 1 A vs Week 1 B")).toBeTruthy();
    expect(within(preview).getByText("B1, B2, B3")).toBeTruthy();

    await uploadCodes(input, "X1,X2,X3,Y1,Y2");

    expect((await screen.findByRole("alert")).textContent).toContain("Need at least 6 tournament codes for 2 target fixtures.");
    expect(screen.getByRole("table", { name: /import preview/i })).toBeTruthy();
    expect(screen.getByText("A1, A2, A3")).toBeTruthy();
    expect(screen.getByText("B1, B2, B3")).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("disables confirmation while parsing and ignores out-of-order file reads", async () => {
    render(<AdminCodeImporter fixtures={fixtures} season="S5" />);

    const input = screen.getByLabelText(/upload tournament code file/i) as HTMLInputElement;
    await uploadCodes(input, "BASE1,BASE2,BASE3,BASE4,BASE5,BASE6");
    expect(await screen.findByText("BASE1, BASE2, BASE3")).toBeTruthy();

    const slow = deferred<string>();
    const fast = deferred<string>();
    const slowFile = deferredFile(slow.promise, "slow.csv");
    const fastFile = deferredFile(fast.promise, "fast.csv");

    fireEvent.change(input, { target: { files: [slowFile.file] } });

    expect(input.disabled).toBe(true);
    expect((screen.getByRole("button", { name: /confirm import/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /confirm import/i }));
    expect(rpc).not.toHaveBeenCalled();

    // Simulate a second change event that was already queued when the control
    // became disabled. Its newer request must win even if the first read ends last.
    fireEvent.change(input, { target: { files: [fastFile.file] } });
    fast.resolve("FAST1,FAST2,FAST3,FAST4,FAST5,FAST6");
    expect(await screen.findByText("FAST1, FAST2, FAST3")).toBeTruthy();

    slow.resolve("SLOW1,SLOW2,SLOW3,SLOW4,SLOW5,SLOW6");
    await waitFor(() => {
      expect(screen.queryByText("SLOW1, SLOW2, SLOW3")).toBeNull();
      expect(screen.getByText("FAST1, FAST2, FAST3")).toBeTruthy();
    });
  });

  it("blocks replacement selection and repeated confirmation while saving", async () => {
    const save = deferred<{ data: number; error: null }>();
    rpc.mockReturnValue(save.promise);
    render(<AdminCodeImporter fixtures={fixtures} season="S5" />);

    const input = screen.getByLabelText(/upload tournament code file/i) as HTMLInputElement;
    await uploadCodes(input, "A1,A2,A3,B1,B2,B3");
    expect(await screen.findByText("A1, A2, A3")).toBeTruthy();

    const confirm = screen.getByRole("button", { name: /confirm import/i }) as HTMLButtonElement;
    fireEvent.click(confirm);

    expect(input.disabled).toBe(true);
    expect(confirm.disabled).toBe(true);
    const replacement = deferredFile(Promise.resolve("X1,X2,X3,Y1,Y2,Y3"), "replacement.csv");
    fireEvent.change(input, { target: { files: [replacement.file] } });
    fireEvent.click(confirm);

    expect(replacement.text).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);

    save.resolve({ data: 6, error: null });
    expect(await screen.findByText(/populated 2 fixtures with 6 codes/i)).toBeTruthy();
    expect(screen.getByText("A1, A2, A3")).toBeTruthy();
  });
});
