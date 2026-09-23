export type SeasonEndCollectionSort = "best" | "name" | "newest" | "rating" | "week";

export const SEASON_END_COLLECTION_SORTS: Array<{ key: SeasonEndCollectionSort; label: string }> = [
  { key: "best", label: "Best first" },
  { key: "name", label: "Name A–Z" },
  { key: "newest", label: "Newest pull" },
  { key: "rating", label: "Highest rating" },
  { key: "week", label: "Newest edition" },
];
