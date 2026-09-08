import { describe, expect, it } from "vitest";
import { draftTurnKey, emptyDraftState, formatFromSettings, stateFromDraftRow, timeoutRetryable } from "./sync";
import type { MatchDraftRow, MatchDraftState } from "./types";

const base: MatchDraftState = {
  fixtureId: "fixture-1",
  gameNumber: 2,
  revision: 10,
  status: "drafting",
  layout: "board",
  currentStepIndex: 6,
  turnStartedAt: "2026-09-08T12:00:00Z",
  turnDeadlineAt: "2026-09-08T12:00:30Z",
  turnAllowanceSeconds: 30,
  bluePendingOvertimeSeconds: 0,
  redPendingOvertimeSeconds: 0,
  blueTeam: { name: "Blue", abbreviation: "BLU", imageUrl: null, players: [] },
  redTeam: { name: "Red", abbreviation: "RED", imageUrl: null, players: [] },
  scheduledTeams: [
    { name: "Blue", abbreviation: "BLU", imageUrl: null, players: [] },
    { name: "Red", abbreviation: "RED", imageUrl: null, players: [] },
  ],
  canChooseSides: false,
  sideChoiceRequired: false,
  blueReady: true,
  redReady: true,
  changeRequest: null,
  positions: null,
  actions: [{ stepIndex: 0, side: "blue", kind: "ban", slot: 1, champion: "Ahri" }],
  blockedChampions: ["stale-server-value"],
};

const row = (overrides: Partial<MatchDraftRow> = {}): MatchDraftRow => ({
  id: "row-2",
  fixture_id: "fixture-1",
  game_number: 2,
  revision: 11,
  status: "drafting",
  layout: "stage",
  current_step_index: 0,
  turn_started_at: null,
  turn_deadline_at: null,
  turn_allowance_seconds: null,
  blue_pending_overtime_seconds: 0,
  red_pending_overtime_seconds: 0,
  blue_team_name: null,
  red_team_name: null,
  blue_ready: false,
  red_ready: false,
  change_request: null,
  positions: null,
  actions: [],
  created_at: "",
  updated_at: "",
  ...overrides,
});

describe("match draft synchronization", () => {
  it("ignores an older realtime row while applying a newer row", () => {
    expect(stateFromDraftRow(base, row({ revision: 9, blue_ready: false }))).toBeNull();
    expect(stateFromDraftRow(base, row({ revision: 12, blue_team_name: "Red", red_team_name: "Blue" }))?.sideChoiceRequired).toBe(false);
  });

  it("recomputes side choice from the row, including default-order selection", () => {
    const next = stateFromDraftRow(base, row({ revision: 11, blue_team_name: "Blue", red_team_name: "Red" }));
    expect(next?.canChooseSides).toBe(true);
    expect(next?.sideChoiceRequired).toBe(false);
  });

  it("turns a deleted game into a local reset state", () => {
    const reset = emptyDraftState(base);
    expect(reset.actions).toEqual([]);
    expect(reset.blueTeam.name).toBe("Blue");
    expect(reset.sideChoiceRequired).toBe(true);
    expect(reset.revision).toBeUndefined();
  });

  it("recognizes settings and timeout errors that should be retried", () => {
    expect(formatFromSettings({ bestOf: 3, fearless: true }, { best_of: 5, fearless: false })).toEqual({ bestOf: 5, fearless: false });
    expect(timeoutRetryable({ message: "TOO_SOON: the turn clock has not expired yet" })).toBe(true);
    expect(timeoutRetryable({ message: "NOT_YOUR_SIDE: no" })).toBe(false);
    expect(draftTurnKey(base)).toContain("10:2:6");
  });
});
