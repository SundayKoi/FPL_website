import { describe, expect, it } from "vitest";
import { describeProvenance, type ProvenanceEvent } from "./provenance";

const doug = { id: "1", name: "Doug" };
const spies = { id: "2", name: "Spies" };

function event(partial: Partial<ProvenanceEvent> & Pick<ProvenanceEvent, "event">): ProvenanceEvent {
  return {
    id: 1,
    from: null,
    to: null,
    at: "2026-08-24T12:00:00Z",
    ref: null,
    ...partial,
  };
}

describe("describeProvenance", () => {
  it("says who pulled a copy and when", () => {
    expect(describeProvenance([event({ event: "minted", to: doug })])).toEqual(["Pulled by Doug · Aug 24"]);
  });

  it("names the receiving side of a trade, not the sending one", () => {
    // The line above already said who was holding it — repeating "from
    // Doug" here turns a story back into a ledger.
    const lines = describeProvenance([
      event({ event: "minted", to: doug }),
      event({ id: 2, event: "transferred", from: doug, to: spies, at: "2026-08-30T09:00:00Z" }),
    ]);
    expect(lines).toEqual(["Pulled by Doug · Aug 24", "Traded to Spies · Aug 30"]);
  });

  it("closes the chain with who destroyed the copy", () => {
    const lines = describeProvenance([
      event({ event: "minted", to: doug }),
      event({ id: 2, event: "dusted", from: doug, at: "2026-09-01T00:30:00Z" }),
    ]);
    expect(lines).toEqual(["Pulled by Doug · Aug 24", "Dusted by Doug · Sep 1"]);
  });

  it("keeps the order it was handed, which is the order it happened", () => {
    const lines = describeProvenance([
      event({ event: "minted", to: doug }),
      event({ id: 2, event: "transferred", from: doug, to: spies, at: "2026-08-30T09:00:00Z" }),
      event({ id: 3, event: "transferred", from: spies, to: doug, at: "2026-09-04T09:00:00Z" }),
    ]);
    expect(lines).toEqual(["Pulled by Doug · Aug 24", "Traded to Spies · Aug 30", "Traded to Doug · Sep 4"]);
  });

  it("reads a timestamp as UTC, so the server and the browser agree", () => {
    // Late enough on the 24th that a westward timezone would call it the
    // 23rd — a hydration mismatch on every card in a collection.
    const lines = describeProvenance([event({ event: "minted", to: doug, at: "2026-08-24T02:00:00Z" })]);
    expect(lines).toEqual(["Pulled by Doug · Aug 24"]);
  });

  it("skips a row with nobody on the side it needs rather than printing a gap", () => {
    expect(describeProvenance([event({ event: "transferred", from: doug, to: null })])).toEqual([]);
    expect(describeProvenance([event({ event: "dusted", from: null })])).toEqual([]);
  });

  it("drops the date rather than trailing a separator when the timestamp is unreadable", () => {
    expect(describeProvenance([event({ event: "minted", to: doug, at: "not a date" })])).toEqual(["Pulled by Doug"]);
  });

  it("has nothing to say about an empty chain", () => {
    expect(describeProvenance([])).toEqual([]);
  });
});
