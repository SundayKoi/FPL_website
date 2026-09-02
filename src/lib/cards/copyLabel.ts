import { editionLabel } from "@/lib/packs/week";

/**
 * "WK Aug 24 edition · #7 of 43", or as much of it as is knowable.
 *
 * Both halves of the stamp have to be there before either is printed: a
 * serial with no run size is a number nobody can read, and a run size with
 * no serial belongs to a different copy. A copy minted before print
 * numbering existed in this environment has neither, and keeps the plain
 * edition line it has always had.
 */
export function copyLabel(
  editionWeek: string | null,
  printNumber: number | null,
  minted: number | null,
): string | undefined {
  if (!editionWeek) return undefined;
  const edition = `${editionLabel(editionWeek)} edition`;
  return printNumber != null && minted ? `${edition} · #${printNumber} of ${minted}` : edition;
}
