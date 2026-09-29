import Link from "next/link";
import { redirect } from "next/navigation";
import AdminPatrons from "@/components/admin/AdminPatrons";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminStaff, { type StaffProfile } from "@/components/admin/AdminStaff";
import { isMissingBroadcasterColumn, fetchStaffTier } from "@/lib/auth/staffTier";
import { loadAdminPatronDesk } from "@/lib/admin/patronDesk";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Staff access & support — FPL Admin" };
export const dynamic = "force-dynamic";

async function fetchStaffProfiles(supabase: Awaited<ReturnType<typeof createServerSupabase>>) {
  const result = await supabase.from("profiles").select("id, display_name, is_admin, is_owner, is_broadcaster").order("display_name");
  if (!result.error) return (result.data as StaffProfile[] | null) ?? [];
  if (!isMissingBroadcasterColumn(result.error)) return null;
  const legacy = await supabase.from("profiles").select("id, display_name, is_admin, is_owner").order("display_name");
  if (legacy.error) return null;
  return ((legacy.data as Omit<StaffProfile, "is_broadcaster">[] | null) ?? []).map((profile) => ({ ...profile, is_broadcaster: false }));
}

export default async function AdminAccessPage() {
  const supabase = await createServerSupabase();
  const { isOwner } = await fetchStaffTier(supabase);
  if (!isOwner) redirect("/admin");

  const [profiles, patronDesk] = await Promise.all([fetchStaffProfiles(supabase), loadAdminPatronDesk()]);
  return (
    <main className="page-backdrop mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 text-content sm:px-6 lg:px-8">
      <AdminSectionHeader title="Staff access & support" description="Owner-only controls for staff roles and patron receipts. Role changes and patron grants remain protected by their existing database and server checks." />
      {profiles ? (
        <AdminStaff profiles={profiles} />
      ) : (
        <p role="alert" className="card-brand p-4 text-sm text-red-300">Staff profiles are unavailable. No access changes can be reviewed.</p>
      )}
      <section id="patrons" className="flex flex-col gap-3" aria-labelledby="patrons-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label-dash">Owner-only</p>
            <h2 id="patrons-heading" className="type-display mt-1 text-2xl">Patron receipts & grants</h2>
          </div>
          <Link href="/admin/patrons" className="text-sm text-action-text underline underline-offset-4">Open receipts as a focused page →</Link>
        </div>
        <AdminPatrons {...patronDesk} />
      </section>
    </main>
  );
}
