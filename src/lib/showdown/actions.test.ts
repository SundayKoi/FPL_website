import { beforeEach, describe, expect, it, vi } from "vitest";

const { createTable } = vi.hoisted(() => ({ createTable: vi.fn() }));
vi.mock("./server", async () => {
  const actual = await vi.importActual<typeof import("./server")>("./server");
  return { ...actual, createTable, sitDown: vi.fn(), standUp: vi.fn(), act: vi.fn(), syncTable: vi.fn() };
});
vi.mock("server-only", () => ({}));

import { createShowdownTableAction } from "./actions";
import { ShowdownActionError } from "./server";

beforeEach(() => {
  createTable.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the action adapters", () => {
  it("return a refusal as data, with the sentence the player needs", async () => {
    createTable.mockRejectedValueOnce(new ShowdownActionError("Give the table a name."));
    expect(await createShowdownTableAction({})).toEqual({ ok: false, error: "Give the table a name." });
  });

  it("return an unexpected failure as a plain sentence, and log the real one", async () => {
    createTable.mockRejectedValueOnce(new Error('insert or update on table "showdown_tables" violates foreign key constraint'));
    const result = await createShowdownTableAction({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Something went wrong on our side/);
      expect(result.error).not.toMatch(/showdown_tables/);
    }
    expect(console.error).toHaveBeenCalled();
  });

  it("return the value on success", async () => {
    createTable.mockResolvedValueOnce(12);
    expect(await createShowdownTableAction({ bracket: "free", name: "Felt" })).toEqual({ ok: true, value: 12 });
  });
});
