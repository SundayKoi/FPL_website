import { describe, expect, it } from "vitest";
import { removeRow, upsertRow } from "./realtimeRows";

const rows = [{ id: "a", n: 1 }, { id: "b", n: 2 }];

describe("upsertRow", () => {
  it("appends a row it has not seen", () => {
    expect(upsertRow(rows, { id: "c", n: 3 }).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("replaces a row in place, keeping order", () => {
    const next = upsertRow(rows, { id: "a", n: 9 });
    expect(next.map((r) => r.id)).toEqual(["a", "b"]);
    expect(next[0].n).toBe(9);
  });

  it("ignores a payload with no id rather than corrupting state", () => {
    // A DELETE payload's `new` is empty; upserting it used to be the whole bug.
    expect(upsertRow(rows, {} as { id: unknown })).toBe(rows);
  });
});

describe("removeRow", () => {
  it("drops the row named by a DELETE payload's old record", () => {
    expect(removeRow(rows, { id: "a" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("is a no-op for an id from another draft", () => {
    expect(removeRow(rows, { id: "elsewhere" }).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("ignores an empty or missing old record", () => {
    expect(removeRow(rows, {})).toBe(rows);
    expect(removeRow(rows, null)).toBe(rows);
    expect(removeRow(rows, undefined)).toBe(rows);
  });
});
