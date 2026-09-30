import type { Dispatch, SetStateAction } from "react";
import { FilterPill } from "./statsUi";

/** The roles the stats tabs filter by, in lane order. */
const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;

/**
 * The role filter's pills: "All", then one per role. Clicking the active
 * role clears it back to All. The row around them and its label belong to
 * each tab, which style them differently.
 */
export function RoleFilterPills({
  role,
  setRole,
}: {
  role: string | null;
  setRole: Dispatch<SetStateAction<string | null>>;
}) {
  return (
    <>
      <FilterPill active={role === null} onClick={() => setRole(null)}>
        All
      </FilterPill>
      {ROLES.map((r) => (
        <FilterPill
          key={r}
          active={role === r}
          onClick={() => setRole((cur) => (cur === r ? null : r))}
          uppercase
        >
          {r}
        </FilterPill>
      ))}
    </>
  );
}
