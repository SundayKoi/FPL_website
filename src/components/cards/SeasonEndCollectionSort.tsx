"use client";

import { useRouter } from "next/navigation";
import { SEASON_END_COLLECTION_SORTS, type SeasonEndCollectionSort as Sort } from "@/lib/season-end/collectionSort";

export default function SeasonEndCollectionSort({ value }: { value: Sort }) {
  const router = useRouter();

  function chooseSort(next: Sort) {
    const url = new URL(window.location.href);
    if (next === "best") url.searchParams.delete("sort");
    else url.searchParams.set("sort", next);
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  }

  return (
    <label className="flex flex-col gap-1 text-xs text-steel">
      Sort
      <select
        value={value}
        onChange={(event) => chooseSort(event.target.value as Sort)}
        className="input-brand px-3 py-2 text-sm"
      >
        {SEASON_END_COLLECTION_SORTS.map((option) => (
          <option key={option.key} value={option.key}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
