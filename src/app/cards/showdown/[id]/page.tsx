import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ShowdownTable from "@/components/showdown/ShowdownTable";
import { loadStackOptions, loadTableView } from "@/lib/showdown/server";

export const metadata: Metadata = {
  title: "Showdown table — FPL",
};

/**
 * One table. The view is built server-side for this viewer — everyone's
 * public state, only your own hole cards — and the client keeps it fresh
 * off the table's realtime rows. Anyone can watch; sitting needs a
 * signed-in member.
 */
export default async function ShowdownTablePage({ params }: PageProps<"/cards/showdown/[id]">) {
  const { id } = await params;
  const tableId = Number(id);
  if (!Number.isInteger(tableId) || tableId <= 0) notFound();
  const [view, options] = await Promise.all([loadTableView(tableId), loadStackOptions()]);
  if (!view) notFound();
  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1160px] flex-1 flex-col gap-6 px-4 py-8 text-white sm:px-6">
      <ShowdownTable initial={view} options={options} />
    </main>
  );
}
