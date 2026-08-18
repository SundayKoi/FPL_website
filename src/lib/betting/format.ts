/**
 * Points as the exchange's currency string — port of the exchange bot's
 * `fmt(points) -> f"${points:,}"`, with the sign moved in front of the
 * dollar sign for negatives (Python's `f"${-500:,}"` reads "$-500"; here it
 * reads "-$500").
 */
export function fmtPoints(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US")}`;
}

/** Local date-time input value (`YYYY-MM-DDTHH:mm`) → ISO string. */
export function toIso(local: string): string {
  return local ? new Date(local).toISOString() : "";
}
