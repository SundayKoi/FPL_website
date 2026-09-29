"use client";

import { useRouter } from "next/navigation";

export default function ScheduleSeasonSelector({
  pathname,
  seasons,
  season,
}: {
  pathname: string;
  seasons: string[];
  season: string | null;
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="label-dash">Season</span>
      <select
        aria-label="Schedule season"
        value={season ?? ""}
        disabled={seasons.length <= 1}
        onChange={(event) => {
          const value = event.target.value;
          if (value) router.push(`${pathname}?season=${encodeURIComponent(value)}`);
        }}
        className="min-h-10 min-w-28 rounded-md border border-border-strong bg-surface px-3 text-sm text-content disabled:cursor-default disabled:opacity-80"
      >
        {seasons.length === 0 ? <option value="">No published season</option> : null}
        {seasons.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
  );
}
