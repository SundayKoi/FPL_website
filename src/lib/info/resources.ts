import type { InfoResource } from "@/components/info/AdminInfoResources";
import { createServerSupabase } from "@/lib/supabase/server";

export const fallbackResources = [
  {
    slug: "payment",
    label: "Payment",
    description: "Send league payments through the official FPL Draft PayPal.",
    href: "https://www.paypal.com/paypalme/DraftFPL",
  },
  {
    slug: "masterdoc",
    label: "MasterDoc",
    description: "Open the shared league spreadsheet for the latest working data.",
    href: "https://docs.google.com/spreadsheets/d/187hoKxxeSpSPtDAmlrTOeuDrcz5kpdwv1qgQ5kipaHY/edit?usp=sharing",
  },
  {
    slug: "rulebook",
    label: "Rulebook",
    description: "Read the formatted Rulebook here or open the source Google Doc.",
    href: "https://docs.google.com/document/d/1rtYs_uhNwp7lwMaUfprRLKlOy0UuXWTs/edit#heading=h.k95um6blnxq7",
  },
] satisfies Omit<InfoResource, "id" | "sort_order">[];

export const rulebookSections = [
  ["League Overview", "league-overview"],
  ["League Structure", "league-structure"],
  ["Auction Draft Begins", "auction-draft"],
  ["Nemesis Draft Begins", "nemesis-draft"],
  ["League Format", "league-format"],
  ["Game Rules/Penalties", "game-rules"],
  ["Gauntlet", "gauntlet"],
  ["Playoffs", "playoffs"],
  ["Additional Rules & Aspects", "additional-rules"],
  ["FPL Staff", "staff"],
] as const;

export async function getInfoPageData() {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const [{ data: resourceRows }, profileResult] = await Promise.all([
    supabase.from("info_resources").select("id, slug, label, description, href, sort_order").order("sort_order"),
    userData.user
      ? supabase.from("profiles").select("is_admin").eq("id", userData.user.id).single()
      : Promise.resolve({ data: null }),
  ]);
  const resources = ((resourceRows as InfoResource[] | null) ?? []).length > 0
    ? (resourceRows as InfoResource[])
    : fallbackResources.map((resource, index) => ({ ...resource, id: resource.slug, sort_order: index + 1 }));
  const isAdmin = Boolean(userData.user && profileResult.data?.is_admin);

  return { resources, isAdmin };
}

export function getRulebookResource(resources: InfoResource[]) {
  const found = resources.find((resource) => resource.slug === "rulebook");
  if (found) return found;
  const fallback = fallbackResources.find((resource) => resource.slug === "rulebook")!;
  return {
    ...fallback,
    id: fallback.slug,
    sort_order: fallbackResources.indexOf(fallback) + 1,
  };
}
