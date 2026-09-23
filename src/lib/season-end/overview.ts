import { AWARD_GROUPS } from "./catalog";
import type { SeasonEndCollectible } from "./collectibles";

/** Arrange only frozen, published designs for the public collection overview. */
export function groupSeasonEndDesigns(designs: SeasonEndCollectible[]) {
  const groups: { title: string; id: string; designs: SeasonEndCollectible[] }[] = AWARD_GROUPS.map((title, index) => ({
    title,
    id: `group-${index}`,
    designs: designs.filter((design) => design.kind !== "season" && design.display.subtitle === title),
  }));
  const otherAwards = designs.filter((design) =>
    design.kind !== "season" && !AWARD_GROUPS.some((group) => group === design.display.subtitle),
  );
  if (otherAwards.length) groups.push({ title: "Other awards", id: "other-awards", designs: otherAwards });
  groups.push({ title: "Cards of the Season", id: "season-cards", designs: designs.filter((design) => design.kind === "season") });
  return groups.filter((group) => group.designs.length > 0);
}
