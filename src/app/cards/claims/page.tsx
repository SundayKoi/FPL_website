import { redirect } from "next/navigation";

/** Keep existing bookmarks working while the claims inbox lives with admin tools. */
export default function LegacyCardClaimsPage() {
  redirect("/admin/claims");
}
