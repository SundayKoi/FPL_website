import Link from "next/link";
import { redirect } from "next/navigation";
import AdminGodPackPreview from "@/components/admin/AdminGodPackPreview";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Design lab — FPL Admin" };

const tools = [
  ["Parallels", "Foil treatments and card looks", "/admin/parallels", false],
  ["Expedition mutations", "Expedition card traits", "/admin/mutations", false],
  ["Card overlays", "Alternate card finishes", "/admin/overlays", false],
  ["The Dribb card", "Five-copy chase print", "/admin/dribb", false],
  ["Champions signing preview", "Owner preview and signing desk", "/admin/champions", true],
  ["Season’s End crop audit", "Review and tune award crops", "/admin/seasons-end/crop-audit", false],
  ["Skin-line parallels", "Public preview of the current skin line", "/skin-lines", false],
] as const;

export default async function AdminDesignPage() {
  const tier = await fetchStaffTier(await createServerSupabase());
  if (!tier.isAdmin && !tier.isOwner) redirect("/admin");

  return (
    <main className="page-backdrop mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 text-content sm:px-6 lg:px-8">
      <AdminSectionHeader title="Design lab" description="Open focused card editors, compare previews, and review public-facing designs. Specialist editors keep their existing owner and staff restrictions." />
      <section id="god-pack-preview" aria-label="God Pack preview">
        <AdminGodPackPreview />
      </section>
      <nav aria-label="Design tools" className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tools.map(([label, detail, href, ownerOnly]) => (
          <div key={href} className="card-brand flex min-h-28 flex-col justify-between gap-3 p-4">
            <div>
              <h2 className="font-semibold text-content">{label}{ownerOnly ? <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-muted">Owner</span> : null}</h2>
              <p className="mt-1 text-xs text-muted">{detail}</p>
            </div>
            {ownerOnly && !tier.isOwner ? (
              <span className="text-xs text-muted">Owner access required</span>
            ) : (
              <Link href={href} className="w-fit text-sm text-action-text underline underline-offset-4">Open tool →</Link>
            )}
          </div>
        ))}
      </nav>
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/cards" className="text-action-text underline underline-offset-4">Public card gallery →</Link>
        <Link href="/guess-the-card" className="text-action-text underline underline-offset-4">Guess the Card preview →</Link>
      </div>
    </main>
  );
}
