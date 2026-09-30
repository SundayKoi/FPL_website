import { describe, expect, it } from "vitest";
import type { LolRole } from "@/lib/draft/types";
import { planRoles, type RolePlanEntrant } from "./roles";

let clock = 0;
function entrant(id: string, primary: LolRole, secondary: LolRole | null = null, overrides: Partial<RolePlanEntrant> = {}): RolePlanEntrant {
  clock += 1;
  return {
    id,
    primary_role: primary,
    secondary_role: secondary,
    signed_up_at: `2026-10-01T00:00:${String(clock).padStart(2, "0")}Z`,
    status: "active",
    ...overrides,
  };
}

function fullTeams(count: number, prefix = "p"): RolePlanEntrant[] {
  const roles: LolRole[] = ["top", "jungle", "mid", "adc", "support"];
  return Array.from({ length: count }, (_, team) => roles.map((role) => entrant(`${prefix}${team}-${role}`, role))).flat();
}

const rowOf = (plan: ReturnType<typeof planRoles>, id: string) => plan.rows.find((row) => row.entrantId === id)!;

describe("planRoles", () => {
  it("makes one team per full set of roles, everyone on their primary", () => {
    const plan = planRoles(fullTeams(2));
    expect(plan.teamCount).toBe(2);
    expect(plan.rows.every((row) => row.status === "active" && !row.onSecondary)).toBe(true);
    expect(plan.primaryCounts).toEqual({ top: 2, jungle: 2, mid: 2, adc: 2, support: 2 });
  });

  it("sits the latest sign-ups of an over-full role out", () => {
    const pool = fullTeams(4);
    const extraTops = [entrant("late-1", "top"), entrant("late-2", "top"), entrant("late-3", "top")];
    const plan = planRoles([...extraTops, ...pool]);
    expect(plan.teamCount).toBe(4);
    for (const extra of extraTops) {
      expect(rowOf(plan, extra.id)).toMatchObject({ status: "benched", role: "top", onSecondary: false });
    }
    expect(plan.rows.filter((row) => row.status === "active")).toHaveLength(20);
  });

  it("moves a later player to a short secondary role", () => {
    const plan = planRoles([
      entrant("top-1", "top"),
      entrant("mid", "mid"),
      entrant("adc", "adc"),
      entrant("support", "support"),
      entrant("top-2", "top", "jungle"),
    ]);
    expect(plan.teamCount).toBe(1);
    expect(rowOf(plan, "top-1")).toMatchObject({ role: "top", onSecondary: false });
    expect(rowOf(plan, "top-2")).toMatchObject({ role: "jungle", status: "active", onSecondary: true });
  });

  it("moves an earlier player to their secondary when that frees a role for a later one", () => {
    const plan = planRoles([
      entrant("flex", "top", "jungle"),
      entrant("mid", "mid"),
      entrant("adc", "adc"),
      entrant("support", "support"),
      entrant("top-only", "top"),
    ]);
    expect(plan.teamCount).toBe(1);
    expect(rowOf(plan, "flex")).toMatchObject({ role: "jungle", onSecondary: true });
    expect(rowOf(plan, "top-only")).toMatchObject({ role: "top", onSecondary: false, status: "active" });
  });

  it("drops to fewer teams when a role cannot be filled", () => {
    const pool = fullTeams(2).filter((row) => row.id !== "p1-support");
    const plan = planRoles([...pool, entrant("extra-mid", "mid")]);
    expect(plan.teamCount).toBe(1);
    expect(plan.rows.filter((row) => row.status === "active")).toHaveLength(5);
  });

  it("serves first come, first served regardless of input order", () => {
    const early = entrant("early-top", "top");
    const rest = fullTeams(1, "q").filter((row) => row.primary_role !== "top");
    const late = entrant("late-top", "top");
    const plan = planRoles([late, ...rest, early]);
    expect(rowOf(plan, "early-top").status).toBe("active");
    expect(rowOf(plan, "late-top").status).toBe("benched");
  });

  it("ignores withdrawn and eliminated players and benches everyone when no team fits", () => {
    const plan = planRoles([
      entrant("a", "top"),
      entrant("b", "jungle"),
      entrant("c", "mid"),
      entrant("d", "adc"),
      entrant("gone", "support", null, { status: "withdrawn" }),
      entrant("out", "support", null, { status: "eliminated" }),
    ]);
    expect(plan.teamCount).toBe(0);
    expect(plan.rows.map((row) => row.entrantId).sort()).toEqual(["a", "b", "c", "d"]);
    expect(plan.rows.every((row) => row.status === "benched")).toBe(true);
  });

  it("brings benched players back into consideration", () => {
    const pool = fullTeams(1).map((row) => (row.primary_role === "mid" ? { ...row, status: "benched" as const } : row));
    expect(planRoles(pool).teamCount).toBe(1);
  });
});
