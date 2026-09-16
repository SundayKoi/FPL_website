import { redirect } from "next/navigation";
/** The old singular URL is retained for saved admin links. */
export default async function SeasonEndRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  redirect(`/admin/seasons-end${query.size ? `?${query}` : ""}`);
}
