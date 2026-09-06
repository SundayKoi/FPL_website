import { expect, it, vi } from "vitest";
import { fetchAllPages } from "./pagination";

it("rejects a failed later page instead of returning an incomplete result", async () => {
  const read = vi.fn()
    .mockResolvedValueOnce({ data: [1, 2], error: null })
    .mockResolvedValueOnce({ data: null, error: new Error("offline") });
  await expect(fetchAllPages(read, { pageSize: 2 })).rejects.toThrow("offline");
});

it("fails at the safety limit instead of silently truncating", async () => {
  const read = vi.fn(async () => ({ data: [1, 2], error: null }));
  await expect(fetchAllPages(read, { pageSize: 2, maxPages: 2 })).rejects.toThrow("refusing to return partial data");
  expect(read.mock.calls).toEqual([[0, 1], [2, 3]]);
});
