/** One query-string value as a page's `searchParams` delivers it. */
export type SearchParamValue = string | string[] | undefined;

/** The first value of a query param: repeated params (`?a=1&a=2`) arrive
 *  as an array, and the first one wins. */
export function firstParam(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
