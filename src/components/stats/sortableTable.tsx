"use client";

import { useCallback, useState } from "react";

export type SortDir = "asc" | "desc";

/** One sortable-table column: sort accessor plus display formatter. */
export type SortableColumn<T, K extends string = string> = {
  key: K;
  label: string;
  numeric: boolean;
  sortValue: (row: T) => number | string;
  display: (row: T) => string;
};

/**
 * Shared sortable-table machinery for the Leaderboard and Champions tables:
 * owns the sort key/direction state, the toggle-direction / default-desc-
 * for-numeric header click handling, and the number-vs-string comparator.
 * `sortRows` is memoized on the current sort so callers can wrap it in
 * their own `useMemo` over the filtered rows.
 */
export function useSortableColumns<T, K extends string>(
  columns: SortableColumn<T, K>[],
  initialKey: K,
): {
  sortKey: K;
  sortDir: SortDir;
  handleSort: (key: K) => void;
  sortRows: (rows: T[]) => T[];
} {
  const [sortKey, setSortKey] = useState<K>(initialKey);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: K) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(columns.find((c) => c.key === key)?.numeric ? "desc" : "asc");
    }
  };

  const sortRows = useCallback(
    (rows: T[]) => {
      const col = columns.find((c) => c.key === sortKey)!;
      const dir = sortDir === "asc" ? 1 : -1;
      return [...rows].sort((a, b) => {
        const av = col.sortValue(a);
        const bv = col.sortValue(b);
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    },
    [columns, sortKey, sortDir],
  );

  return { sortKey, sortDir, handleSort, sortRows };
}

/** A sortable `<th>`: aria-sort plus the label button with the ▲/▼ indicator. */
export function SortableHeaderCell<T, K extends string>({
  column,
  active,
  sortDir,
  onSort,
  className = "",
}: {
  column: SortableColumn<T, K>;
  active: boolean;
  sortDir: SortDir;
  onSort: (key: K) => void;
  className?: string;
}) {
  return (
    <th
      className={`px-2 py-2 text-left ${className}`}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className={`flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
          active ? "text-cyan [text-shadow:0_0_8px_rgb(53_230_255/0.4)]" : "text-steel hover:text-white"
        }`}
      >
        {column.label}
        {active && <span aria-hidden="true">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}
